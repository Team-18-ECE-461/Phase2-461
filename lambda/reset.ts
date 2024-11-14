import { 
    DynamoDBClient, 
    DeleteTableCommand, 
    CreateTableCommand,
    DescribeTableCommand
  } from "@aws-sdk/client-dynamodb";
  import { 
    DynamoDBDocumentClient, 
    PutCommand 
  } from "@aws-sdk/lib-dynamodb";
  import { S3Client, ListObjectsCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
  import { APIGatewayProxyHandler } from "aws-lambda";
  
  // Initialize clients
  const dynamoDBClient = new DynamoDBClient({ region: "us-west-2" });
  const dynamoDBDocClient = DynamoDBDocumentClient.from(dynamoDBClient);
  const s3Client = new S3Client({ region: "us-west-2" });
  
  // Constants for default user and AWS resource names
  const DEFAULT_USERNAME = "ece30861defaultadminuser";
  const DEFAULT_PASSWORD = "correcthorsebatterystaple123(!__+@**(A;DROP TABLE packages";
  const DYNAMODB_TABLE_NAME = "PackagesTable"; // Change this to your table name
  const S3_BUCKET_NAME = "your-s3-bucket-name"; // Change this to your S3 bucket name
  
  export const resetRegistry: APIGatewayProxyHandler = async (event) => {
    try {
      // Delete all items in DynamoDB table (or delete and recreate if simpler)
      await deleteDynamoDBTable();
      await delay(5000); // Wait 5 seconds for table deletion
      await createDynamoDBTable();
  
      // Clear S3 bucket
      await clearS3Bucket();
  
      // Re-add default user to the system (implementation depends on your auth setup)
      await addDefaultUser();
  
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Registry reset to default state." }),
      };
    } catch (error) {
      const err = error as any;
      console.error("Error resetting registry:", err.message || err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to reset registry." }),
      };
    }
  };
  
  // Helper function to add delay between DynamoDB table delete and recreate
  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async function deleteDynamoDBTable() {
    try {
      // Check if table exists
      await dynamoDBClient.send(new DescribeTableCommand({ TableName: DYNAMODB_TABLE_NAME }));
  
      // If it exists, proceed to delete
      await dynamoDBClient.send(new DeleteTableCommand({ TableName: DYNAMODB_TABLE_NAME }));
      console.log(`Table ${DYNAMODB_TABLE_NAME} deleted successfully.`);
    } catch (error) {
      const err = error as any;
      // If error is "ResourceNotFoundException", the table doesn't exist
      if (err.name === "ResourceNotFoundException") {
        console.log(`Table ${DYNAMODB_TABLE_NAME} does not exist. Skipping delete.`);
      } else {
        console.error("Error deleting DynamoDB table:", err.message || error);
      }
    }
  }
  
  async function createDynamoDBTable() {
    try {
      await dynamoDBClient.send(
        new CreateTableCommand({
          TableName: DYNAMODB_TABLE_NAME,
          KeySchema: [
            { AttributeName: "Name", KeyType: "HASH" }, // Partition key
            { AttributeName: "Version", KeyType: "RANGE" }, // Sort key
          ],
          AttributeDefinitions: [
            { AttributeName: "Name", AttributeType: "S" },
            { AttributeName: "Version", AttributeType: "S" },
          ],
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        })
      );
    } catch (error) {
        const err = error as any;
      console.error("Error creating DynamoDB table:", err.message || error);
    }
  }
  
  async function clearS3Bucket() {
    try {
      const listCommand = new ListObjectsCommand({ Bucket: S3_BUCKET_NAME });
      const objects = await s3Client.send(listCommand);
  
      if (objects.Contents && objects.Contents.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: S3_BUCKET_NAME,
          Delete: { Objects: objects.Contents.map((obj) => ({ Key: obj.Key! })) },
        });
        await s3Client.send(deleteCommand);
      }
    } catch (error) {
        const err = error as any;
      console.error("Error clearing S3 bucket:", err.message || error);
    }
  }
  
  async function addDefaultUser() {
    const defaultUser = {
      TableName: DYNAMODB_TABLE_NAME,
      Item: {
        Username: DEFAULT_USERNAME,
        Password: DEFAULT_PASSWORD,
        Role: "admin",
      },
    };
  
    try {
      await dynamoDBDocClient.send(new PutCommand(defaultUser));
    } catch (error) {
        const err = error as any;
      console.error("Error adding default user:", err.message || error);
    }
  }
  