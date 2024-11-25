import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, ScanCommand, DeleteItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const tableName = 'PackageInfo';
const defaultUser = {
    id: { S: 'defaultadminuser' }, // Replace with the correct primary key attribute
    username: { S: 'ece30861defaultadminuser' },
    password: { S: 'correcthorsebatterystaple123(!__+@**(A;DROP TABLE packages' },
    role: { S: 'admin' }, // Optional: Add any additional attributes relevant for your system
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Step 1: Scan to retrieve all items in the table
        const scanCommand = new ScanCommand({ TableName: tableName });
        const scanResult = await client.send(scanCommand);

        if (scanResult.Items && scanResult.Items.length > 0) {
            // Step 2: Delete each item in the table
            for (const item of scanResult.Items) {
                const deleteCommand = new DeleteItemCommand({
                    TableName: tableName,
                    Key: {
                        id: item.id, // Replace 'id' with the actual primary key
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
            body: JSON.stringify({ message: 'Failed to reset table.', error: error.message }),
        };
    }
};
