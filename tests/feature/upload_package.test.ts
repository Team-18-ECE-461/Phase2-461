/**
 * Unit tests for the `lambdaHandler` function in the `upload_package` Lambda.
 *
 * This test suite validates the functionality of the `lambdaHandler` function,
 * which handles uploading packages to an AWS infrastructure involving S3 and DynamoDB.
 *
 * Features tested:
 * - Uploading packages via content (base64-encoded zip files).
 * - Uploading packages via URLs (GitHub and NPM).
 * - Duplicate package rejection.
 * - Validation of invalid request scenarios (e.g., both Content and URL provided).
 * - Handling of debloating logic for GitHub and NPM URLs.
 *
 * Mocking:
 * - AWS SDK clients (S3 and DynamoDB) are used to simulate interactions with storage and database services.
 * - JSZip is mocked to simulate creating and parsing package files.
 *
 * Test scenarios:
 * 1. Successful package uploads with content, GitHub URLs, and NPM URLs.
 * 2. Rejection of duplicate packages.
 * 3. Validation of improper inputs, such as providing both content and URL.
 * 4. Debloating scenarios for GitHub and NPM URLs.
 */


import { lambdaHandler } from '../../lambda/upload_package';
import { S3, DynamoDB } from 'aws-sdk';
import * as JSZIP from 'jszip';
import AWS from 'aws-sdk';
AWS.config.update({ region: 'us-east-1' }); // Replace 'us-east-1' with your desired region



describe('Package Upload Lambda', () => {
  const s3 = new S3();
  const dynamoDB = new DynamoDB.DocumentClient();

  // Helper to create a mock Lambda event
interface MockEventData {
    URL?: string;
    Content?: string | null;
    Name: string;
    debloat: boolean;
    JSProgram: string;
}

interface MockEvent {
    body: string;
    httpMethod: string;
}

const createMockEvent = (data: MockEventData): MockEvent => ({
    body: JSON.stringify(data),
    httpMethod: 'POST'
});

  describe('Package Upload with Content', () => {
    it('should upload a package successfully', async () => {
      // Create a sample zip file
      const zipBuffer = await new JSZIP.default().generateAsync({ type: 'nodebuffer' });
      const zip = await JSZIP.loadAsync(zipBuffer);

      zip.file('package.json', JSON.stringify({
        name: 'test-package-version2',
        version: '1.0.0'
      }));
      const zipContent = await zip.generateAsync({ type: 'base64' });

      const event = createMockEvent({
        Content: zipContent,
        Name: 'test-package_version2',
        debloat: false,
        JSProgram: ''
      });

      const result = await lambdaHandler(event);


      // Assertions
      expect(result.statusCode).toBe(201);
      
      // Verify S3 upload
      const s3Object = await s3.getObject({
        Bucket: 'packagesstorage',
        Key: 'test-package-1.0.0'
      }).promise();
      expect(s3Object).toBeTruthy();

      // Verify DynamoDB entry
      const dynamoResult = await dynamoDB.query({
        TableName: 'PackageInfo',
        KeyConditionExpression: '#name = :name',
        ExpressionAttributeNames: {
          '#name': 'Name'
        },
        ExpressionAttributeValues: {
          ':name': 'test-package_version2'
        },

      }).promise();
      console.log(dynamoResult);

      expect(dynamoResult.Items && dynamoResult.Items.length).toBeGreaterThanOrEqual(1);
      //expect(dynamoResult.Items[0].Version).toBe('1.0.0');
    });

    it('should reject duplicate package upload', async () => {
      // First upload
      const zipBuffer = await new JSZIP.default().generateAsync({ type: 'nodebuffer' });
      const zip = await JSZIP.loadAsync(zipBuffer);
      const zipContent = await zip.generateAsync({ type: 'base64' });

      const firstEvent = createMockEvent({
        Content: zipContent,
        Name: 'duplicate-package',
        debloat: false,
        JSProgram: ''
      });

      await lambdaHandler(firstEvent);

      // Second upload should fail
      const secondResult = await lambdaHandler(firstEvent);

      expect(secondResult.statusCode).toBe(409);
    });
  });

  // Add more test cases for URL uploads, GitHub uploads, etc.
  describe('Package Upload with Github URL', () => {
    it('should upload a package successfully', async () => {
      const event = createMockEvent({
        URL: 'https://github.com/SocketDev/socket-cli',
        Name: 'socket',
        debloat: false,
        JSProgram: ''
      });
      const result =await lambdaHandler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should reject duplicate package upload', async () => {
      const event = createMockEvent({
        URL: 'https://github.com/SocketDev/socket-cli',
        Name: 'socket',
        debloat: false,
        JSProgram: ''
      });
    const result = await lambdaHandler(event);
    expect(result.statusCode).toBe(409);
    });
});

describe('Package Upload with NPM URL', () => {
  it('should upload a package successfully', async () => {
    const event = createMockEvent({
      URL: 'https://www.npmjs.com/package/react',
      Name: 'react',
      debloat: false,
      JSProgram: ''
    });
    const result = await lambdaHandler(event);
    expect(result.statusCode).toBe(201);
  });

  it('should reject duplicate package upload', async () => {
    const event = createMockEvent({
      URL: 'https://www.npmjs.com/package/react',
      Name: 'react',
      debloat: false,
      JSProgram: ''
    });
    const result = await lambdaHandler(event);
    expect(result.statusCode).toBe(409);
  });
});

it('should return 400 if both content and url are provided', async () => {
    const event = createMockEvent({
        Content: 'content',
        URL: 'url',
        Name: 'name',
        debloat: false,
        JSProgram: ''
    });
    
    const result = await lambdaHandler(event);
    expect(result.statusCode).toBe(400);
    expect(result.body).toBe(JSON.stringify('Invalid Request Body!'));

});

it('should not work with invalid debloat content', async () => {
    const zipBuffer = await new JSZIP.default().generateAsync({ type: 'nodebuffer' });
    const zip = await JSZIP.loadAsync(zipBuffer);
    zip.file('package.json', JSON.stringify({
        name: 'test-package',
        version: '1.0.0'
    }));
    const zipContent = await zip.generateAsync({ type: 'base64' });

    const event = createMockEvent({
        Content: zipContent,
        Name: 'test-package',
        debloat: true,
        JSProgram: ''
    });

    const result = await lambdaHandler(event);
    expect(result.statusCode).toBe(400);
});

it('should work with debloat git URL', async () => {
    const event = createMockEvent({
        URL: 'https://github.com/lodash/lodash',
        Name: 'lodash',
        debloat: true,
        JSProgram: ''
    });
    const result = await lambdaHandler(event);  
    expect(result.statusCode).toBe(201);
});

it('should work with debloat npm URL', async () => {
    const event = createMockEvent({
        URL: 'https://www.npmjs.com/package/cool-package',
        Name: 'cool-package',
        debloat: true,
        JSProgram: ''
    });
    const result = await lambdaHandler(event);
    expect(result.statusCode).toBe(201);
});

});

 