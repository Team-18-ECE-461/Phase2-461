import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });

/**
 * Recursively calculates the size cost of a package's dependencies.
 * @param packageId The ID of the package.
 * @param visited A set to track visited packages (avoid circular dependencies).
 * @returns The cumulative size of the package and its dependencies.
 */
const calculateCost = async (packageId: string, visited: Set<string>): Promise<number> => {
  if (visited.has(packageId)) {
    console.warn(`Circular dependency detected for package: ${packageId}`);
    return 0; // Avoid infinite recursion
  }

  visited.add(packageId);

  // Fetch the package data
  const result = await client.send(
    new GetItemCommand({
      TableName: "PackageInfo",
      Key: { packageId: { S: packageId } },
    })
  );

  const packageData = result.Item;
  if (!packageData) {
    console.warn(`Package ${packageId} not found.`);
    return 0;
  }

  const size = parseInt(packageData.size?.N || "0", 10);
  const dependencies = packageData.dependencies?.L?.map((dep) => dep.S) || [];

  // Recursively calculate the size for all dependencies
  let totalDependencySize = 0;
  for (const dep of dependencies) {
    if (dep) {
      totalDependencySize += await calculateCost(dep, visited);
    }
  }

  return size + totalDependencySize;
};

export const cost: APIGatewayProxyHandler = async (event) => {
  try {
    // Parse the input (list of package IDs)
    const body = JSON.parse(event.body || "{}");
    const packageIds: string[] = body.packageIds || [];

    if (!Array.isArray(packageIds) || packageIds.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid input. Provide a list of package IDs." }),
      };
    }

    const visited = new Set<string>();
    const costResults: { [key: string]: number } = {};

    // Calculate costs for each package
    for (const packageId of packageIds) {
      costResults[packageId] = await calculateCost(packageId, visited);
    }

    return {
      statusCode: 200,
      body: JSON.stringify(costResults),
    };
  } catch (error) {
    console.error("Error calculating package costs:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to calculate package costs. Check server logs." }),
    };
  }
};
