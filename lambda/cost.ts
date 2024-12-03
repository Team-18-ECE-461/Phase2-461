import { DynamoDB } from 'aws-sdk';
import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';

const dynamoDb = new DynamoDB.DocumentClient();

interface PackageData {
    Name: string;
    Version: string;
    Size: number;
    Dependencies: { Name: string; Version: string }[];
}

interface PackageRequestBody {
    packages: { Name: string; Version: string }[];
}

interface APIGatewayProxyResult {
    statusCode: number;
    body: string;
}


export const cost: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const body: PackageRequestBody = JSON.parse(event.body || '{}');
        const packages: { Name: string; Version: string }[] = body.packages;

        if (!Array.isArray(packages) || packages.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid packages array' }),
            };
        }

        // Fetch package data for the given list
        const packageData: PackageData[] = await fetchPackageData(packages);

        // Compute cumulative size, avoiding duplicates
        const cumulativeSize: number = computeCumulativeSize(packageData);

        return {
            statusCode: 200,
            body: JSON.stringify({ cumulativeSize }),
        };
    } catch (error) {
        console.error('Error processing request:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
};

const fetchPackageData = async (
    packages: { Name: string; Version: string }[]
): Promise<PackageData[]> => {
    const results: PackageData[] = [];

    for (const pkg of packages) {
        const params = {
            TableName: 'PackageInfo', // Table name from your screenshot
            Key: {
                Name: pkg.Name,
                Version: pkg.Version,
            },
            ProjectionExpression: 'Name, Version, Size, Dependencies',
        };

        const result = await dynamoDb.get(params).promise();
        if (result.Item) {
            results.push(result.Item as PackageData);
        } else {
            throw new Error(`Package not found: ${pkg.Name}@${pkg.Version}`);
        }
    }

    return results;
};

const computeCumulativeSize = (packageData: PackageData[]): number => {
    const seen = new Set<string>();
    let totalSize = 0;

    const traverse = (pkg: PackageData) => {
        const uniqueId = `${pkg.Name}@${pkg.Version}`;
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
