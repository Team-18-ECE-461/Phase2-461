/**
 * @file reset.ts
 * 
 * This file contains the implementation of an AWS Lambda function that resets a DynamoDB table
 * and sets a default user in another table. The function is designed to be triggered by an 
 * API Gateway event.
 * 
 * The main functionality includes:
 * - Scanning the 'PackageInfo' DynamoDB table to retrieve all items.
 * - Deleting each item from the 'PackageInfo' table using both partition and sort keys.
 * - Setting a default user in the 'Users' table.
 * 
 * @module resetRegistry
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, ScanCommand, DeleteItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const tableName = 'PackageInfo';
const defaultUser = {
    username: { S: 'ece30861defaultadminuser' },
    role: { S: 'admin' }, // Optional: Add any additional attributes relevant for your system
};

/**
 * Resets the 'PackageInfo' DynamoDB table and sets a default user in the 'Users' table.
 *  
 * @param {APIGatewayProxyEvent} event - The API Gateway event object.
 * @returns {APIGatewayProxyResult} - The API Gateway response object.
 */
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
