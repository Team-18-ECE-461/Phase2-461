import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import JSZip from 'jszip';

const s3 = new S3({});
const dynamoDBclient = new DynamoDBClient({});
const BUCKET_NAME = 'packagesstorage';
const TABLE_NAME = 'PackageInfo';

interface PackageDetails {
    name: string;
    version: string;
    url: string;
}

interface PackageJson {
    name?: string;
    version?: string;
    dependencies?: { [key: string]: string };
    [key: string]: unknown;
}

async function streamToBuffer(stream: ReadableStream | NodeJS.ReadableStream): Promise<Buffer> {
    console.log("Converting S3 stream to buffer...");
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    console.log(`Converted stream to buffer of length ${buffer.length} bytes.`);
    return buffer;
}

async function fetchPackageDetails(packageId: string): Promise<PackageDetails> {
    console.log(`Fetching package details for ID: ${packageId}`);
    const params = {
        TableName: TABLE_NAME,
        IndexName: "ID-index",
        KeyConditionExpression: "ID = :id",
        ExpressionAttributeValues: {
            ":id": { S: packageId },
        },
    };

    try {
        console.log("Sending query to DynamoDB...");
        const result = await dynamoDBclient.send(new QueryCommand(params));
        const items = result.Items;
        console.log(`DynamoDB query returned ${items ? items.length : 0} items.`);

        if (!items || items.length === 0) {
            console.error(`Package ID not found: ${packageId}`);
            throw new Error("Package not found");
        }

        let packageName = "No name";
        let packageVersion = "No version";
        let packageURL = "No URL";

        for (const item of items) {
            packageName = item.Name?.S || "No name";
            packageVersion = item.Version?.S || "No version";
            packageURL = item.URL?.S || "No URL";
        }

        console.log(`DynamoDB item details - Name: ${packageName}, Version: ${packageVersion}, URL: ${packageURL}`);

        if (packageName === "No name" || packageVersion === "No version") {
            console.error(`Invalid package details: ${packageId}`);
            throw new Error("Invalid package details");
        }

        return { name: packageName, version: packageVersion, url: packageURL };
    } catch (error) {
        console.error(`Error fetching package details for ID: ${packageId}`, error);
        throw error;
    }
}

async function fetchPackageFileFromS3(packageName: string, version: string): Promise<PackageJson> {
    const key = `${packageName}-${version}`;
    console.log(`Fetching package zip from S3 with key: ${key}`);

    try {
        console.log("Sending GetObjectCommand to S3...");
        const data = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
        console.log(`Received response from S3 for key: ${key}`);

        if (!data || !data.Body) {
            console.error(`File not found in S3: ${key}`);
            throw new Error("File not found in S3");
        }

        const buffer = await streamToBuffer(data.Body as NodeJS.ReadableStream);
        console.log(`Loading buffer into JSZip...`);
        const zip = await JSZip.loadAsync(buffer);
        console.log("Zip file loaded successfully.");

        let packageFile: JSZip.JSZipObject | null = null;
        console.log("Searching for 'package.json' inside the zip...");
        zip.forEach((relativePath, file) => {
            if (relativePath.endsWith('package.json')) {
                console.log(`Found package.json at: ${relativePath}`);
                packageFile = file;
            }
        });

        if (!packageFile) {
            console.error(`'package.json' file not found inside zip for ${packageName}-${version}`);
            throw new Error("'package.json' file not found in zip");
        }

        const packageContent = await (packageFile as JSZip.JSZipObject).async('string');
        console.log("package.json extracted and read as string. Parsing JSON...");

        const parsed = JSON.parse(packageContent) as PackageJson;
        console.log("JSON parsed successfully. Returning parsed content.");
        return parsed;
    } catch (error: any) {
        if (error.Code === "NoSuchKey") {
            console.error(`File not found in S3: ${key}`);
            throw new Error(`The file for package "${packageName}" version "${version}" does not exist.`);
        }
        console.error(`Error fetching package for ${packageName}-${version}`, error);
        throw error;
    }
}

async function getPackageSizeFromS3(packageName: string, version: string): Promise<number> {
    const key = `${packageName}-${version}`;
    console.log(`Fetching package size from S3 for key: ${key}`);
    try {
        const headData = await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
        const size = headData.ContentLength ?? 0;
        console.log(`Size of ${key} is ${size} bytes`);
        return size;
    } catch (error) {
        console.error(`Error fetching size for ${packageName}-${version}`, error);
        return 0;
    }
}

async function calculateCumulativeSize(
    packageJson: PackageJson,
    visited: Set<string>,
    packageName: string,
    packageVersion: string
): Promise<number> {
    console.log(`Calculating cumulative size for ${packageName}@${packageVersion}`);
    const pkgKey = `${packageName}-${packageVersion}`;

    if (visited.has(pkgKey)) {
        console.log(`Already visited ${pkgKey}, skipping double count.`);
        return 0;
    }

    visited.add(pkgKey);

    const selfSize = await getPackageSizeFromS3(packageName, packageVersion);
    const dependencies = packageJson.dependencies || {};
    console.log(`Found ${Object.keys(dependencies).length} dependencies for ${packageName}@${packageVersion}.`);
    let totalSize = selfSize;

    for (const [depName, depVersion] of Object.entries(dependencies)) {
        console.log(`Processing dependency: ${depName}@${depVersion}`);
        try {
            const depKey = `${depName}-${depVersion}`;
            if (visited.has(depKey)) {
                console.log(`Dependency ${depKey} already visited, skipping.`);
                continue;
            }

            const depPackageDetails = await fetchPackageDetails(depKey);
            console.log(`Fetched details for dependency: ${depPackageDetails.name}@${depPackageDetails.version}`);
            const depPackageJson = await fetchPackageFileFromS3(depPackageDetails.name, depPackageDetails.version);
            console.log(`Fetched package file for dependency: ${depPackageDetails.name}@${depPackageDetails.version}. Calculating its cumulative size...`);

            const depSize = await calculateCumulativeSize(depPackageJson, visited, depPackageDetails.name, depPackageDetails.version);
            totalSize += depSize;
            console.log(`Added ${depSize} bytes from ${depName}@${depVersion}. Running total for ${pkgKey}: ${totalSize} bytes.`);
        } catch (error) {
            console.error(`Error processing dependency: ${depName}@${depVersion}`, error);
        }
    }

    console.log(`Cumulative size for ${pkgKey}: ${totalSize} bytes.`);
    return totalSize;
}

/**
 * Lambda handler for calculating package size.
 * 
 * This handler supports:
 * - `packageIds`: An array of package IDs in the request body OR a single package ID in path parameters.
 * - `dependency`: A boolean (in the request body) that determines if totalCost includes dependencies.
 *
 * If `dependency` is not provided or is false, totalCost = standaloneCost (just the package).
 * If `dependency` is true, totalCost includes the package and its dependencies.
 *
 * Return format for each package:
 * {
 *   "packageID": {
 *     "standaloneCost": <number>,
 *     "totalCost": <number>
 *   }
 * }
 *
 * Error cases:
 * 400: Missing fields in PackageID
 * 403: Authentication failed (if you implement authentication logic)
 * 404: Package does not exist
 * 500: Internal error (system choked on metrics)
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log("Event received:", JSON.stringify(event, null, 2));

    let packageIds: string[] = [];
    let dependency = false; // default

    if (event.body) {
        try {
            const requestBody = JSON.parse(event.body);
            if (Array.isArray(requestBody.packageIds)) {
                packageIds = requestBody.packageIds;
            }
            if (typeof requestBody.dependency === 'boolean') {
                dependency = requestBody.dependency;
            }
        } catch (e) {
            console.error("Failed to parse request body", e);
        }
    }

    if (packageIds.length === 0 && event.pathParameters?.id) {
        packageIds.push(event.pathParameters.id);
    }

    if (packageIds.length === 0) {
        // 400 error: missing fields in PackageID
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "There is missing field(s) in the PackageID" }),
        };
    }

    // If authentication logic is added and fails:
    // return {
    //   statusCode: 403,
    //   body: JSON.stringify({ message: "Authentication failed due to invalid or missing AuthenticationToken" })
    // };

    console.log(`Processing the following package IDs: ${packageIds.join(", ")}`);

    const visited = new Set<string>();
    const result: Record<string, { standaloneCost: number; totalCost: number }> = {};

    try {
        for (const pkgId of packageIds) {
            console.log(`Starting processing for package ID: ${pkgId}`);
            const packageDetails = await fetchPackageDetails(pkgId);

            console.log(`Fetching package.json from S3 for ${packageDetails.name}@${packageDetails.version}...`);
            const packageJson = await fetchPackageFileFromS3(packageDetails.name, packageDetails.version);

            // Always get standalone cost
            const standaloneCost = await getPackageSizeFromS3(packageDetails.name, packageDetails.version);

            let totalCost: number;
            if (dependency) {
                console.log(`Dependency=true. Calculating cumulative size (includes dependencies) for ${packageDetails.name}@${packageDetails.version}`);
                totalCost = await calculateCumulativeSize(packageJson, visited, packageDetails.name, packageDetails.version);
            } else {
                console.log(`Dependency=false. Total cost = standalone cost for ${packageDetails.name}@${packageDetails.version}`);
                totalCost = standaloneCost;
            }

            result[pkgId] = { standaloneCost, totalCost };
            console.log(`For package ${pkgId}: standaloneCost=${standaloneCost}, totalCost=${totalCost}`);
        }

        // Success: return 200 with the desired structure
        return {
            statusCode: 200,
            body: JSON.stringify(result),
        };
    } catch (error: any) {
        console.error("Error during execution:", error);

        if (typeof error.message === 'string') {
            if (error.message.includes("Package not found")) {
                // 404: Package does not exist
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: "Package does not exist." }),
                };
            }
            // If some authentication logic fails:
            // return {
            //   statusCode: 403,
            //   body: JSON.stringify({ message: "Authentication failed due to invalid or missing AuthenticationToken." })
            // }; change!
        }

        // 500: internal error
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "The package rating system choked on at least one of the metrics." }),
        };
    }
}
