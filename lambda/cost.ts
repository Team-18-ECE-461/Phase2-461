import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient, GetItemCommand, BatchGetItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });

const fetchDependencies = async (dependencyIds: string[]) => {
  const result = await client.send(
    new BatchGetItemCommand({
      RequestItems: {
        PackageInfo: {
          Keys: dependencyIds.map((id) => ({ packageId: { S: id } })),
        },
      },
    })
  );
  return result.Responses?.PackageInfo || [];
};
/**
 * Recursively calculates the size cost of a package's dependencies.
 * @param packageId The ID of the package.
 * @param visited A set to track visited packages (avoid circular dependencies).
 * @returns The cumulative size of the package and its dependencies.
 */
const calculateCost = async (packageId: string, visited: Set<string>, cache: Map<string, number>): Promise<number> => {
  if (visited.has(packageId)) return 0;
  if (cache.has(packageId)) return cache.get(packageId)!;

  visited.add(packageId);

  const result = await client.send(new GetItemCommand({ TableName: "PackageInfo", Key: { packageId: { S: packageId } } }));
  const packageData = result.Item;
  if (!packageData) return 0;

  const size = parseInt(packageData.size?.N || "0", 10);
  const dependencies = (packageData.dependencies?.L?.map((dep) => dep.S) || []).filter((dep): dep is string => !!dep);

  const dependencyCosts = await Promise.all(dependencies.map((dep) => calculateCost(dep, visited, cache)));
  const totalSize = size + dependencyCosts.reduce((sum, cost) => sum + cost, 0);

  cache.set(packageId, totalSize);
  return totalSize;
};


export const cost: APIGatewayProxyHandler = async (event) => {
  try {
    const packageId = event.pathParameters?.id;

    if (!packageId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Package ID is required in the path." }),
      };
    }

    const visited = new Set<string>();
    const cache = new Map<string, number>();
    const totalCost = await calculateCost(packageId, visited, cache);

    return {
      statusCode: 200,
      body: JSON.stringify({ packageId, totalCost }),
    };
  } catch (error) {
    console.error("Error calculating package cost:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to calculate package cost. Check server logs." }),
    };
  }
};
