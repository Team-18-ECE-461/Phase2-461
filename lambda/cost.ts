import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand, QueryCommandOutput } from "@aws-sdk/lib-dynamodb";
import axios from "axios";

// Initialize DynamoDB Client
const dynamoDBclient = new DynamoDBClient({});
const TABLE_NAME = "PackageInfo"; // Replace with your DynamoDB table name
const INDEX_NAME = "ID-index"; // Replace with your actual GSI name if required

// Define TypeScript interfaces for package data
interface PackageBaseData {
    Name: string;
    Version: string;
    URL: string;
}

interface LambdaResponse {
    statusCode: number;
    body: string;
}

// Lambda handler
export const lambdaHandler = async (event: any): Promise<LambdaResponse> => {
    try {
        // Extract `id` from the path parameters
        const packageId: string | undefined = event.pathParameters?.id;
        if (!packageId) {
            return { statusCode: 400, body: JSON.stringify({ message: "Invalid request: Package ID is required" }) };
        }

        // Fetch the package details by ID from DynamoDB
        const packageBaseData = await fetchPackageBaseDataById(packageId);
        if (!packageBaseData) {
            return { statusCode: 404, body: JSON.stringify({ message: `Package with ID ${packageId} not found` }) };
        }

        // Ensure the URL exists
        if (!packageBaseData.URL || packageBaseData.URL === "No URL") {
            return { statusCode: 500, body: JSON.stringify({ message: "No valid URL found for this package" }) };
        }

        // Fetch the cost (number of dependencies) from the URL
        const cost = await fetchNumberOfDependencies(packageBaseData.URL);

        return {
            statusCode: 200,
            body: JSON.stringify({ cost }), // Return only the cost
        };
    } catch (error: any) {
        console.error("Error processing request:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error", details: error.message }),
        };
    }
};

// Fetch package data from DynamoDB
const fetchPackageBaseDataById = async (packageId: string): Promise<PackageBaseData> => {
    try {
        const params = {
            TableName: TABLE_NAME,
            IndexName: INDEX_NAME, // Specify GSI if needed
            KeyConditionExpression: "ID = :id",
            ExpressionAttributeValues: {
                ":id": packageId,
            },
            ProjectionExpression: "ID, #name, Version, #url", // Escape reserved keywords
            ExpressionAttributeNames: {
                "#name": "Name", // Map #name to the actual attribute Name
                "#url": "URL", // Map #url to the actual attribute URL
            },
        };

        const command = new QueryCommand(params);
        const result: QueryCommandOutput = await dynamoDBclient.send(command);
        const items = result.Items;

        if (!items || items.length === 0) {
            throw new Error(`Package with ID ${packageId} not found`);
        }

        // Extract package information
        const item = items[0];
        return {
            Name: item.Name || "No name",
            Version: item.Version || "No version",
            URL: item.URL || "No URL",
        };
    } catch (error) {
        console.error(`Error fetching package base data for ID ${packageId}`, error);
        throw error;
    }
};

// Fetch number of dependencies from the URL
const fetchNumberOfDependencies = async (url: string): Promise<number> => {
    try {
        const response = await axios.get(url);

        // Assuming the response is the package.json file
        if (!response.data) {
            throw new Error(`No data returned from URL: ${url}`);
        }

        const packageJSON = response.data;

        // Check for a valid `dependencies` field
        if (packageJSON.dependencies && typeof packageJSON.dependencies === "object") {
            return Object.keys(packageJSON.dependencies).length; // Count the number of dependencies
        } else {
            console.warn(`No dependencies found in the package.json from URL: ${url}`);
            return 0; // No dependencies found
        }
    } catch (error) {
        console.error(`Error fetching or processing package.json from URL: ${url}`, error);
        throw new Error(`Failed to fetch or parse dependencies from URL: ${url}`);
    }
};
