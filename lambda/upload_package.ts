import { S3 } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import axios from 'axios';
import * as JSZIP from 'jszip';

interface LambdaEvent {
  Content?: string;
  URL?: string;
  JSProgram: string;
}

const s3 = new S3();
const dynamoDBclient = new DynamoDBClient({});
const BUCKET_NAME = 'packagesstorage';
const TABLE_NAME = 'PackageInfo';

export const lambdaHandler = async (event: LambdaEvent): Promise<any> => {
  try {
    const content = event.Content;
    const url = event.URL;
    const JSProgram = event.JSProgram;

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
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      zipBuffer = Buffer.from(response.data);
    } else {
      throw new Error('No content or URL provided');
    }

    // Load zip content to inspect package.json
    const zip = await JSZIP.loadAsync(zipBuffer);
    const packageJsonFile = zip.file('package.json');

    if (!packageJsonFile) {
      return {
        statusCode: 400,
        body: JSON.stringify('package.json not found in the zip file'),
      };
    }

    const packageJsonContent = await packageJsonFile.async('string');
    const packageInfo = JSON.parse(packageJsonContent);

    const packageName = packageInfo.name || 'Undefined';
    const packageVersion = packageInfo.version || 'Undefined';

    // Check if the package already exists in DynamoDB
    const existingPackage = await dynamoDBclient
      .send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { Name: packageName, Version: packageVersion },
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
