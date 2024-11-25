import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, ScanCommand, DeleteItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const tableName = 'PackageInfo';
const defaultUser = {
    ID: { S: 'defaultadminuser' }, // Ensure this matches the schema's primary key name
    Name: { S: 'Default Admin User' },
    Version: { S: '1.0' },
    CreatedAt: { S: new Date().toISOString() },
    JSProgram: { S: '' },
    URL: { S: '' },
    VersionInt: { N: '1' }, // Assuming VersionInt is numeric
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Step 1: Scan to retrieve all items in the table
        const scanCommand = new ScanCommand({ TableName: tableName });
        const scanResult = await client.send(scanCommand);

        if (scanResult.Items && scanResult.Items.length > 0) {
            // Step 2: Delete each item in the table
            for (const item of scanResult.Items) {
                if (!item.ID || !item.ID.S) {
                    console.warn(`Skipping item without valid ID: ${JSON.stringify(item)}`);
                    continue;
                }

                const deleteCommand = new DeleteItemCommand({
                    TableName: tableName,
                    Key: {
                        ID: { S: item.ID.S }, // Use ID as the partition key
                    },
                });
                await client.send(deleteCommand);
            }
        }

        // Step 3: Set the default user
        const putCommand = new PutItemCommand({
            TableName: tableName,
            Item: defaultUser,
        });
        await client.send(putCommand);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Table cleared and default user set successfully.' }),
        };
    } catch (error) {
        console.error('Error resetting table:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to reset table.', error: (error as any).message }),
        };
    }
};
