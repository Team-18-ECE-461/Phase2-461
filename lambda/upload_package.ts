import { S3 } from '@aws-sdk/client-s3';
import * as base64 from 'base-64';

interface LambdaEvent {
  content: string;
}

interface LambdaContext {}

export const lambdaHandler = async (event: LambdaEvent, context: LambdaContext) => {
  const s3 = new S3();

  try {
    // Retrieve the base64 encoded content from the event
    const getFileContent = event.content;

    // Decode the base64 content
    const decodeContent = Buffer.from(getFileContent, 'base64');

    // Upload the decoded content to S3
    await s3.putObject({
      Bucket: 'packagesstorage',
      Key: 'data.zip',
      Body: decodeContent
    });

    // Return a successful response
    return {
      statusCode: 200,
      body: JSON.stringify('The Object is Uploaded successfully!')
    };
  } catch (error) {
    console.error('Error uploading object to S3:', error);

    // Return an error response
    return {
      statusCode: 500,
      body: JSON.stringify('Failed to upload the object.')
    };
  }
};
