import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetCommand, GetCommandOutput } from '@aws-sdk/lib-dynamodb';
import axios from 'axios';
import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';

const dynamoDb = new DynamoDBClient({});

interface APIGatewayProxyResult {
    statusCode: number;
    body: string;
}

interface PackageData {
    ID: string;
    Name: string;
    Version: string;
    URL: string;
}

interface DependencyData {
    size: number;
    dependencies: { Name: string; Version: string; URL: string }[];
}

export const lambdaHandler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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
        const packageBaseData = await fetchPackageBaseDataById(packageId);

        if (!packageBaseData) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: `Package with ID ${packageId} not found` }),
            };
        }

        // Compute the total cost (cumulative size of the package and its dependencies)
        const totalCost = await computeCost(packageBaseData);

        return {
            statusCode: 200,
            body: JSON.stringify({ cost: totalCost }),
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

const fetchPackageBaseDataById = async (id: string): Promise<PackageData | null> => {
    try {
        const params = {
            TableName: 'PackageInfo', // Your actual DynamoDB table name
            Key: { ID: id },
            ProjectionExpression: 'ID, Name, Version, URL',
        };

        const command = new GetCommand(params);
        const result: GetCommandOutput = await dynamoDb.send(command);
        return result.Item as PackageData | null;
    } catch (error) {
        console.error(`Error fetching package base data for ID ${id}`, error);
        throw error;
    }
};

const computeCost = async (packageData: PackageData): Promise<number> => {
    const seen = new Set<string>();

    const calculateSize = async (pkg: PackageData): Promise<number> => {
        const uniqueId = `${pkg.Name}@${pkg.Version}`;
        if (seen.has(uniqueId)) return 0; // Avoid double-counting
        seen.add(uniqueId);

        try {
            // Fetch package data from the URL
            const response = await axios.get(pkg.URL);
            const { size, dependencies }: DependencyData = response.data;

            if (!size) throw new Error(`Size not found for package ${pkg.Name}@${pkg.Version}`);

            // Recursively compute the size of dependencies
            let totalDependencySize = 0;
            for (const dep of dependencies) {
                // Directly use dependency URL to fetch its size
                const depSizeResponse = await axios.get(dep.URL);
                const depSizeData: DependencyData = depSizeResponse.data;

                totalDependencySize += depSizeData.size;

                // Resolve further dependencies recursively
                totalDependencySize += await computeCost({
                    ID: '',
                    Name: dep.Name,
                    Version: dep.Version,
                    URL: dep.URL,
                });
            }

            return size + totalDependencySize;
        } catch (error) {
            console.error(`Error fetching data from URL: ${pkg.URL}`, error);
            throw new Error(`Failed to fetch data from URL: ${pkg.URL}`);
        }
    };

    return await calculateSize(packageData);
};