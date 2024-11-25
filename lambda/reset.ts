import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, ScanCommand, DeleteItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const tableName = 'PackageInfo';
const defaultUser = {
    username: { S: 'ece30861defaultadminuser' },
    role: { S: 'admin' }, // Optional: Add any additional attributes relevant for your system
};

export const resetRegistry = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Scan the table to retrieve all items
        const scanCommand = new ScanCommand({ TableName: tableName });
        const scanResult = await client.send(scanCommand);

        // Check if there are any items to delete
        if (scanResult.Items && scanResult.Items.length > 0) {
            for (const item of scanResult.Items) {
                // Ensure both Name (partition key) and Version (sort key) exist
                if (!item.Name?.S || !item.Version?.S) {
                    console.warn(`Skipping item without valid keys: ${JSON.stringify(item)}`);
                    continue;
                }

                // Delete each item using both partition and sort keys
                const deleteCommand = new DeleteItemCommand({
                    TableName: tableName,
                    Key: {
                        Name: { S: item.Name.S }, // Partition key
                        Version: { S: item.Version.S }, // Sort key
                    },
                });
                await client.send(deleteCommand);
            }
        }

        // Step 3: Set the default user
        const putCommand = new PutItemCommand({
            TableName: 'Users',
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
