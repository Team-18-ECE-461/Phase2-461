import { S3 } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import axios from 'axios';
import * as JSZIP from 'jszip';

interface LambdaEvent {
  body: string;
  // Content?: string;
  // URL?: string;
  // JSProgram: string;
}

function urlhandler(url:string){
  if(url.includes('github')){
    const repoNameMatch = url.match(/github\.com\/[^\/]+\/([^\/]+)/);
    if (repoNameMatch && repoNameMatch[1]) {
      return repoNameMatch[1], url;
    }
  }

}

const s3 = new S3();
const dynamoDBclient = new DynamoDBClient({});
const BUCKET_NAME = 'packagesstorage';
const TABLE_NAME = 'PackageInfo';

export const lambdaHandler = async (event: LambdaEvent): Promise<any> => {
  try {

    const requestBody = JSON.parse(event.body);
    let content = requestBody.Content;
    const url = requestBody.URL;
    const JSProgram = requestBody.JSProgram;

    // Check if either content or url is set, but not both
    if ((!content && !url) || (content && url)) {
      return {
        statusCode: 400,
        body: JSON.stringify('Invalid Request Body!'),
      };
    }

    // Temporary file name for the zip package
    const fileName = `package-${Date.now()}.zip`;

    // Retrieve zip file contents
    let zipBuffer: Buffer;
    if (content) {
      zipBuffer = Buffer.from(content, 'base64');
    } else if (url) {
      const response = await axios.get(`${url}/archive/refs/heads/main.zip`, { responseType: 'arraybuffer' });
      zipBuffer = Buffer.from(response.data);
    } else {
      throw new Error('No content or URL provided');
    }

    // Load zip content to inspect package.json
    const zip = await JSZIP.loadAsync(zipBuffer);
    content  = zipBuffer.toString('base64');
    let tpackageJsonFile: JSZIP.JSZipObject | null = null;
    zip.forEach((relativePath, file) => {
    if (relativePath.endsWith('package.json')) {
      tpackageJsonFile = zip.file(relativePath); // Capture the relative path to package.json
    }
    });
    const packageJsonFile = tpackageJsonFile;

    let packageName = 'Undefined';
    let packageVersion = 'Undefined';
    
    if(packageJsonFile){
      const packageJsonContent = await (packageJsonFile as JSZIP.JSZipObject).async('string');
      const packageInfo = JSON.parse(packageJsonContent);

      packageName = packageInfo.name || 'Undefined';
      packageVersion = packageInfo.version || 'Undefined';
    }

    // Check if the package already exists in DynamoDB
    const existingPackage = await dynamoDBclient
      .send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { Name: {S: packageName}, Version: {S : packageVersion} },
      }));
      
    if (existingPackage.Item) {
      return {
        statusCode: 409, // Conflict
        body: JSON.stringify({
          message: 'Package already exists',
          package: existingPackage.Item,
        }),
      };
    }

    // Upload zip file to S3 if the package does not already exist
    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: zipBuffer,
      ContentType: 'application/zip',
    });

    // Save package details to DynamoDB
    const item = {
      ID: { S: fileName },
      Name: { S: packageName },
      Version: { S: packageVersion },
      JSProgram: { S: JSProgram },
      CreatedAt: { S: new Date().toISOString() },
    };

    await dynamoDBclient.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: item
    }));


  
    return {
      statusCode: 201,
      body: JSON.stringify({
        metadata: {
          Name: item.Name,
          Version: item.Version,
          ID: item.ID,
        },
        data: {
          Content: content,
          URL: url, 
          JSProgram: JSProgram,
        },
      }),
    };

  } catch (error) {
    console.error('Error processing request:', error);
    return {
      statusCode: 500,
      body: JSON.stringify('Failed to process the request.'),
    };
  }
};
