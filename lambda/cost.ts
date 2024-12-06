import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, QueryCommand, QueryCommandOutput } from '@aws-sdk/client-dynamodb';
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
    [key: string]: unknown; // allow additional fields
}

/**
 * Convert S3 stream to buffer.
 * @param {ReadableStream} stream - The S3 object stream.
 * @returns {Promise<Buffer>}
 */
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

/**
 * Fetch package details from DynamoDB.
 * @param {string} packageId - The ID of the package (format: name-version).
 * @returns {Promise<PackageDetails>}
 */
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

/**
 * Fetch the 'package.json' file by retrieving the package's zip from S3 and extracting it.
 *
 * The S3 object is named `${packageName}-${version}` (no '.zip' extension).
 * Inside the zip, we look for 'package.json'.
 *
 * @param {string} packageName - Name of the package.
 * @param {string} version - Version of the package.
 * @returns {Promise<PackageJson>} - Parsed package.json content as JSON.
 */
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

        console.log("Extracting package.json content...");
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

/**
 * Get the size of the package zip file from S3 by using a HEAD request.
 * This will give us the Content-Length which represents the size of the zip.
 *
 * @param {string} packageName
 * @param {string} version
 * @returns {Promise<number>} - size of the package zip in bytes
 */
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

/**
 * Recursively calculate the cumulative size of a package and its dependencies.
 *
 * @param {PackageJson} packageJson - The package.json content.
 * @param {Set<string>} visited - A set to track visited packages (avoid double counting).
 * @param {string} packageName - Name of the current package.
 * @param {string} packageVersion - Version of the current package.
 * @returns {Promise<number>} - The cumulative size in bytes (including this package and all its deps).
 */
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

    // Get this package's own size
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
 * This handler supports querying multiple packages at once. The request can be:
 * - A single package ID via pathParameters.id (e.g., /package/{id}/cost)
 * - Multiple packages via event.body: { "packageIds": ["pkgA-1.0.0", "pkgB-2.3.4"] }
 *
 * If multiple packages are requested, we sum them up without double-counting shared dependencies.
 *
 * @param {APIGatewayProxyEvent} event - The Lambda event.
 * @returns {Promise<APIGatewayProxyResult>} - The Lambda response.
 */
export async function lambdaHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log("Event received:", JSON.stringify(event, null, 2));


    let packageIds: string[] = [];
    if (event.body) {
        try {
            const requestBody = JSON.parse(event.body);
            if (Array.isArray(requestBody.packageIds)) {
                packageIds = requestBody.packageIds;
            }
        } catch (e) {
            console.error("Failed to parse request body", e);
        }
    }

    // Fallback to path parameter if no array provided
    if (packageIds.length === 0 && event.pathParameters?.id) {
        packageIds.push(event.pathParameters.id);
    }


    if (packageIds.length === 0) {
        console.error("No package IDs provided.");
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "At least one Package ID is required" }),
        };
    }

    console.log(`Processing the following package IDs: ${packageIds.join(", ")}`);

    const visited = new Set<string>();
    let totalSize = 0;

    try {
        for (const pkgId of packageIds) {
            console.log(`Starting processing for package ID: ${pkgId}`);
            const packageDetails = await fetchPackageDetails(pkgId);

            if (packageDetails.url && packageDetails.url !== "No URL") {
                console.log(`Package URL found: ${packageDetails.url}`);
            } else {
                console.log("No package URL found, proceeding with S3 extraction.");
            }

            // Fetch the package.json inside the zip stored in S3
            console.log(`Fetching package.json from S3 for ${packageDetails.name}@${packageDetails.version}...`);
            const packageJson = await fetchPackageFileFromS3(packageDetails.name, packageDetails.version);

            console.log(`Calculating cumulative size for top-level package ${packageDetails.name}@${packageDetails.version}...`);
            const pkgSize = await calculateCumulativeSize(packageJson, visited, packageDetails.name, packageDetails.version);
            totalSize += pkgSize;
            console.log(`Added ${pkgSize} bytes from top-level package ${packageDetails.name}@${packageDetails.version}. Running total: ${totalSize} bytes.`);
        }

        console.log("Returning successful response.");
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Cumulative size calculated successfully",
                totalSize: totalSize,
            }),
        };
    } catch (error: any) {
        console.error("Error during execution:", error);
        if (typeof error.message === 'string' && error.message.includes("does not exist")) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: error.message }),
            };
        }

        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error" }),
        };
    }

}

