import { S3, GetObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';

const s3 = new S3();
const dynamoDBclient = new DynamoDBClient({});
const BUCKET_NAME = 'packagesstorage';
const TABLE_NAME = 'PackageInfo2';

interface LambdaEvent {
    httpMethod: string,
    pathParameters: { id: string },
    body: string
}

export const lambdaHandler = async (event: LambdaEvent) => {
  const httpMethod = event.httpMethod;
  const requestBody = JSON.parse(event.body);
  const packageId =event.pathParameters.id;

  switch (httpMethod) {
    case 'GET':
      return await handleGetPackage(packageId);
    case 'POST':
      return await handleUpdatePackage(event);
    case 'DELETE':
      return await handleDeletePackage(packageId);
    default:
      return {
        statusCode: 405,
        body: JSON.stringify({ message: 'Method Not Allowed' }),
      };
  }
};

async function handleGetPackage(packageId: string) {
    try {
        if (!packageId) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request' }) };
        }
        const params = {
            TableName: TABLE_NAME, // The DynamoDB table to query
            KeyConditionExpression: "ID = :id", // Search for items where ID equals a specific value
            ExpressionAttributeValues: { 
              ":id": { S: packageId },           // The actual value for the ID (a string type in this case)
            },}
        const result = await dynamoDBclient.send(new QueryCommand(params));
        const items = result.Items;
        let packageVersion = 'No version';
        let packageName = 'No name';
        let JSProgram = 'No JSProgram';
        
        if (!items || items.length === 0) {
          return { statusCode: 404, body: JSON.stringify({ message: 'Package not found' }) };
        }



        items.forEach((item) => {
            packageVersion = item.Version.S? item.Version.S : 'No version';
            packageName = item.Name.S? item.Name.S : 'No name';
            JSProgram = item.JSProgram.S? item.JSProgram.S : 'No JSProgram';
        });

        if(packageVersion === 'No version') {
            return { statusCode: 404, body: JSON.stringify({ message: 'Version not found' }) };
        }

        const s3Client = new S3();
        const key = `${packageId}/${packageVersion}`;
        const param = {
            Bucket: BUCKET_NAME,
            Key: key
          };
      
        const data = await s3Client.send(new GetObjectCommand(param));
        let base64Content = '';
      
          // Convert the Body stream to a Buffer
        if(data && data.Body) {
            const stream = data.Body as ReadableStream;
            const reader = stream.getReader();
            const chunks = [];
            let done, value;
            while ({ done, value } = await reader.read(), !done) {
                chunks.push(value);
            }
            const buffer = Buffer.concat(chunks);
            base64Content = buffer.toString('base64');
        }

        return { statusCode: 200, body: JSON.stringify({
            metadata: {
                Name: packageName,
                Version: packageVersion,
                ID: packageId,
              },
              data: {
                Content: base64Content,
                JSProgram: JSProgram,
                },
            })};
              
      } catch (error) {
        console.error('Error fetching package:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error retrieving package' }) };
      }
}

async function handleUpdatePackage(event: LambdaEvent) {
    try {
        const requestBody = JSON.parse(event.body);
        const packageId = requestBody.metadata.ID;
        const packageName = requestBody.metadata.Name;
        const packageVersion = requestBody.metadata.Version;
        const content = requestBody.data.content;
        const url = requestBody.data.url;
        const JSProgram = requestBody.data.JSProgram;
        const currentTime = Date.now();

        



        if(!content && !url || content && url) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request' }) };
        }

        const checkParams = {
            TableName: TABLE_NAME,
            Key: {
              ID: { S: packageId }
            }
          };
      
        const checkResult = await dynamoDBclient.send(new GetItemCommand(checkParams));
      
        if (!checkResult.Item) {
            return { statusCode: 404, body: JSON.stringify({ message: "Package not found" }) };
        }

        const CreatedAt = checkResult.Item.CreatedAt.S;
        if (!CreatedAt) {
            throw new Error("CreatedAt is undefined");
        }
        const isNewer = await isNewerPackage(CreatedAt, packageName);
        const s3 = new S3();

        if(isNewer){
            //create new version in dynamoDB and s3
            const newitem = {
                ID: { S: packageId },
                Name: { S: packageName },
                Version: { S: packageVersion },
                JSProgram: { S: JSProgram },
                CreatedAt: { S: new Date().toISOString() },
                };
            await dynamoDBclient.send(new PutItemCommand({
                TableName: TABLE_NAME,
                Item: newitem,
            }));

            if(content){
                const zipBuffer = Buffer.from(content, 'base64');
                const key = `${packageName}/${packageVersion}`;
                await s3.putObject({
                    Bucket: BUCKET_NAME,
                    Key: key,
                    Body: zipBuffer,
                    ContentType: 'application/zip',
                });
            }
            else if (url) {
                const key = `${packageId}/${packageVersion}`;
                const response = await axios.get(`${url}/archive/refs/heads/main.zip`, { responseType: 'arraybuffer' });
                const zipBuffer = Buffer.from(response.data);
                const urlcontent = zipBuffer.toString('base64');
                await s3.putObject({
                    Bucket: BUCKET_NAME,
                    Key: key,
                    Body: zipBuffer,
                    ContentType: 'application/zip',
                });
            }       

        }

        else {
            
        }

        //update package in dynamoDB
        const item = {
            ID: { S: packageId },
            Name: { S: packageName },
            Version: { S: packageVersion },
            JSProgram: { S: JSProgram },
            CreatedAt: { S: new Date().toISOString() },
            };
        
        await dynamoDBclient.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: item,
        }));

        //update package in S3

        if (content) {
            const zipBuffer = Buffer.from(content, 'base64');
            const key = `${packageName}/${packageVersion}`;
            await s3.putObject({
                Bucket: BUCKET_NAME,
                Key: key,
                Body: zipBuffer,
                ContentType: 'application/zip',
            });
        }
        else if (url) {
            const key = `${packageId}/${packageVersion}`;
            const response = await axios.get(`${url}/archive/refs/heads/main.zip`, { responseType: 'arraybuffer' });
            const zipBuffer = Buffer.from(response.data);
            //const urlcontent = zipBuffer.toString('base64');
            await s3.putObject({
                Bucket: BUCKET_NAME,
                Key: key,
                Body: zipBuffer,
                ContentType: 'application/zip',
            });
        }

    }
    catch (error) {
        console.error('Error updating package:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error updating package' }) };
    }
}

async function handleDeletePackage(id:string){
    try {
        const params = {
            TableName: TABLE_NAME,
            Key: {
              ID: { S: id }
            }
          };
      
        const result = await dynamoDBclient.send(new GetItemCommand(params));
      
        if (!result.Item) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Package not found' }) };
        }

        const key = `${id}/${result.Item.Version.S}`;
        const s3 = new S3();
        const s3Params = {
            Bucket: BUCKET_NAME,
            Key: key
          };

        await s3.deleteObject(s3Params);
        await dynamoDBclient.send(new DeleteItemCommand(params));
      
        return { statusCode: 200, body: JSON.stringify({ message: 'Package deleted' }) };
    } catch (error) {
        console.error('Error deleting package:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error deleting package' }) };
    }

}

async function getMostRecentVersion(packageName: string) {
    const params = {
        TableName: TABLE_NAME,          // Replace with your table name
        IndexName: "PackageNameVersionIndex",     // Name of the GSI with Name and CreatedAt
        KeyConditionExpression: "Name = :name",// Query by the package name
        ExpressionAttributeValues: {
          ":name": { S: packageName },         // Replace packageName with the name you're querying for
        },      
        ScanIndexForward: false,               // Sort results in descending order by CreatedAt
        Limit: 1                               // Only retrieve the most recent entry
      };
      
      try {
        const result = await dynamoDBclient.send(new QueryCommand(params));
        if (result.Items && result.Items.length > 0) {
          const mostRecentVersion = result.Items[0].CreatedAt.S;
          return mostRecentVersion;
        } else {
          console.log("Package not found.");
        }
      } catch (error) {
        console.error("Error querying DynamoDB:", error);
      }
}

async function isNewerPackage(IDCreatedAt: string, packageName:string ) {
    // Convert the IDCreatedAt timestamp from DynamoDB to a number
    const IDCreatedAtTimestamp = new Date(IDCreatedAt).getTime();
    
    // Get the CreatedAt timestamp of the most recent version in ISO string format
    const mostRecentVersionCreatedAt = await getMostRecentVersion(packageName);
    if(!mostRecentVersionCreatedAt) {
        throw new Error("mostRecentVersionCreatedAt is undefined");
    }
    const mostRecentVersionTimestamp = new Date(mostRecentVersionCreatedAt).getTime();
    
    // Compare the timestamps
    if (IDCreatedAtTimestamp > mostRecentVersionTimestamp) {
        return true; // IDCreatedAt is newer
    } else {
        return false; // mostRecentVersionCreatedAt is newer or the same
    }
}


