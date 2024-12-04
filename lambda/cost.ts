import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetCommand, GetCommandOutput } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';

const dynamoDb = new DynamoDBClient({});

interface PackageData {
    ID: string;
    Name: string;
    Version: string;
    Size: number;
    Dependencies: { Name: string; Version: string }[];
}

interface APIGatewayProxyResult {
    statusCode: number;
    body: string;
}

export const cost: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Extract `id` from the path parameters
        const packageId = event.pathParameters?.id;

        if (!packageId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Package ID is required in the path' }),
            };
        }

        // Fetch the package details by ID from DynamoDB
        const packageData = await fetchPackageDataById(packageId);

        if (!packageData) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: `Package with ID ${packageId} not found` }),
            };
        }

        // Compute cumulative size, avoiding duplicates
        const cumulativeSize: number = computeCumulativeSize([packageData]);

        return {
            statusCode: 200,
            body: JSON.stringify({ cumulativeSize }),
        };
    } catch (error) {
        console.error('Error processing request:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error instanceof Error ? error.message : 'An unknown error occurred',
            }),
        };
    }
};

const fetchPackageDataById = async (id: string): Promise<PackageData | null> => {
    try {
        const params = {
            TableName: 'PackageInfo', // Replace with your actual DynamoDB table name
            Key: {
                ID: id,
            },
            ProjectionExpression: 'ID, Name, Version, Size, Dependencies',
        };

        const command = new GetCommand(params);
        const result: GetCommandOutput = await dynamoDb.send(command);
        return result.Item as PackageData | null;
    } catch (error) {
        console.error(`Error fetching package data for ID ${id}`, error);
        throw error;
    }
};

const computeCumulativeSize = (packageData: PackageData[]): number => {
    const seen = new Set<string>();
    let totalSize = 0;

    const traverse = (pkg: PackageData) => {
        const uniqueId = pkg.ID;
        if (seen.has(uniqueId)) return;
        seen.add(uniqueId);

        totalSize += pkg.Size;

        pkg.Dependencies?.forEach(dep => {
            const depData = packageData.find(
                p => p.Name === dep.Name && p.Version === dep.Version
            );
            if (depData) traverse(depData);
        });
    };

    packageData.forEach(traverse);
    return totalSize;
};

/*

import { DynamoDB } from 'aws-sdk';
import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';

const dynamoDb = new DynamoDB.DocumentClient();

interface PackageData {
    ID: string;
    Name: string;
    Version: string;
    Size: number;
    Dependencies: { Name: string; Version: string }[];
}

interface APIGatewayProxyResult {
    statusCode: number;
    body: string;
}

export const cost: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Extract `id` from the path parameters
        const packageId = event.pathParameters?.id;

        if (!packageId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Package ID is required in the path' }),
            };
        }

        // Fetch the package details by ID from DynamoDB
        const packageData = await fetchPackageDataById(packageId);

        if (!packageData) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: `Package with ID ${packageId} not found` }),
            };
        }

        // Compute cumulative size, avoiding duplicates
        const cumulativeSize: number = computeCumulativeSize([packageData]);

        return {
            statusCode: 200,
            body: JSON.stringify({ cumulativeSize }),
        };
    } catch (error) {
        console.error('Error processing request:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error instanceof Error ? error.message : 'An unknown error occurred',
            }),
        };
    }
};

const fetchPackageDataById = async (id: string): Promise<PackageData | null> => {
    try {
        const params = {
            TableName: 'PackageInfo', // Replace with your actual DynamoDB table name
            Key: {
                ID: id,
            },
            ProjectionExpression: 'ID, Name, Version, Size, Dependencies',
        };

        const result = await dynamoDb.get(params).promise();
        return result.Item as PackageData | null;
    } catch (error) {
        console.error(`Error fetching package data for ID ${id}`, error);
        throw error;
    }
};

const computeCumulativeSize = (packageData: PackageData[]): number => {
    const seen = new Set<string>();
    let totalSize = 0;

    const traverse = (pkg: PackageData) => {
        const uniqueId = pkg.ID;
        if (seen.has(uniqueId)) return;
        seen.add(uniqueId);

        totalSize += pkg.Size;

        pkg.Dependencies?.forEach(dep => {
            const depData = packageData.find(
                p => p.Name === dep.Name && p.Version === dep.Version
            );
            if (depData) traverse(depData);
        });
    };

    packageData.forEach(traverse);
    return totalSize;
};
*/

