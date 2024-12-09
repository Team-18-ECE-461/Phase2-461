import { Manager } from './manager';
import { exec } from 'child_process';
import { Metrics } from './calc_metrics';
import * as database from './database';
//import { getgithuburl } from 'get-github-url'
import { Controller } from './controller';
import { OutputMetrics } from './output_metrics';
import { UrlHandler } from './url_handler';
import fs from 'fs';
import path from 'path';
import { log } from 'console';
import JSZIP from 'jszip';
import { S3, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';

// Create AWS SDK clients for S3 and DynamoDB
const s3 = new S3();
const dynamoDBclient = new DynamoDBClient({});
const BUCKET_NAME = 'packagesstorage'; // Name of the S3 bucket for package storage
const TABLE_NAME = 'PackageInfo'; // Name of the DynamoDB table for package metadata

// Retrieve environment variables for logfile and log level
let logfile = process.env.LOG_FILE as string;
let logLvl = process.env.LOG_LEVEL as string;

const DB_FILE_PATH = '/tmp/metrics.db';

// Ensure the database file is deleted if it exists
if (fs.existsSync(DB_FILE_PATH)) {
    try {
        fs.unlinkSync(DB_FILE_PATH);
        console.log(`Deleted existing database file: ${DB_FILE_PATH}`);
    } catch (error) {
        console.error(`Error deleting database file: ${error}`);
    }
}

// Check if the logfile is specified and set a default value if not
if (!logfile) {
    logfile = "/tmp/app.log";
    console.error("No logfile given");
    //process.exit(1);
}

// Set default log level if not provided
if (!logLvl) {
    logLvl = "0";
}

// Create the directory for the logfile if it doesn't exist
const logDir = path.dirname(logfile);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Open the logfile
const fp = fs.openSync(logfile, 'w');

let line: string; // Current URL to process
let out: any; // Output from the metrics calculation
let index = 0; // Index of the current URL
const db = database.createConnection(fp, +logLvl); // Create a database connection
const metric_calc = new Metrics(db, fp, +logLvl); // Metrics calculator instance
const output_metrics = new OutputMetrics(db, 1, fp, +logLvl); // Output metrics generator instance
const urlHandler = new UrlHandler(db, fp, +logLvl); // URL handler instance

// Initialize the database table
database.createTable(db, fp, +logLvl);
/**
 * Parses GitHub URLs into a standardized format.
 * Handles variations such as `git://`, `git+`, and `.git` suffixes.
 * Extracts the owner and repository name from the URL.
 * 
 * @param url - The raw GitHub URL.
 * @returns The standardized GitHub repository URL.
 */
function pareseGitURL(url: string): string {
    if (url.startsWith("git://")) {
        url = url.replace("git://", "https://");
    }
    if (url.startsWith("git+")) {
        url = url.replace("git+", "");
    }
    if(url.endsWith(".git")) {
        url = url.slice(0, -4);
    }
    // extract owner and repo from url, should work for any www.github.com/owner/repo format
    let urlParts = url.split('/');
    let owner = urlParts[urlParts.length - 2];
    let repo = urlParts[urlParts.length - 1];
    url = `https://github.com/${owner}/${repo}`;

    return url;
}

/**
 * Processes a given package URL.
 * Steps:
 * 1. Adds the URL to the database.
 * 2. Runs the URL handler to process the package.
 * 3. Calculates metrics for the package.
 * 4. Generates output metrics for the package.
 * 
 * @param line - The URL to process.
 * @param index - The index of the current package in the batch.
 */

async function processUrl(line: string, index: number) {
    if(line.includes('github.com')){line = pareseGitURL(line);}
    await database.addEntry(db, line, fp, +logLvl);
    console.log("added entry")
    await urlHandler.main(index + 1, line);
    console.log("url handler")
    await metric_calc.calc(index + 1, line);
    console.log("metric calc")
    out = await output_metrics.output_Metrics(index + 1, line);
    console.log("output metrics")
}
interface LamdaEvent {
    body: string;
    pathParameters: { id: string },
}
/**
 * Lambda handler function for processing package URLs or retrieving package metadata.
 * Steps:
 * 1. Retrieves package metadata from DynamoDB or S3.
 * 2. Extracts or constructs the package URL.
 * 3. Processes the URL using the `processUrl` function.
 * 
 * @param event - The Lambda event containing the request data.
 * @returns An HTTP response object with a status code and body.
 */

exports.lambdaHandler = async (event: LamdaEvent) => {
    let body = JSON.parse(event.body);
    const packageId =event.pathParameters.id;
    try {
        if (!packageId) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request' }) };
        }
        const params = {
          TableName: TABLE_NAME,               // The DynamoDB table to query
          IndexName: "ID-index",               // Specify the GSI name here
          KeyConditionExpression: "ID = :id",  // Search for items where ID equals a specific value
          ExpressionAttributeValues: { 
              ":id": { S: packageId },         // The actual value for the ID (a string type in this case)
          },
      };

      const result = await dynamoDBclient.send(new QueryCommand(params));
        const items = result.Items;
        let packageVersion = 'No version';
        let packageName = 'No name';
        let JSProgram = 'No JSProgram';
        let packageURL = 'No URL';
        
        if (!items || items.length === 0) {
          return { statusCode: 404, body: JSON.stringify({ message: 'Package not found' }) };
        }



        items.forEach((item) => {
            packageVersion = item.Version.S? item.Version.S : 'No version';
            packageName = item.Name.S? item.Name.S : 'No name';
            //JSProgram = item.JSProgram.S? item.JSProgram.S : 'No JSProgram';
            packageURL = item.URL.S? item.URL.S : 'No URL';
        });

        if(packageVersion === 'No version' || packageName === 'No name') {
            return { statusCode: 404, body: JSON.stringify({ message: 'package not found' }) };
        }

        if(packageURL !== 'No URL' && packageURL !== '') {
            line = packageURL;
        }

       else{
        const s3Client = new S3();
        const key = `${packageName}-${packageVersion}`;
        const param = {
            Bucket: BUCKET_NAME,
            Key: key
          };
      
        let buffer = Buffer.from('');
        const data = await s3Client.send(new GetObjectCommand(param));
        if(data && data.Body) {
            const stream = data.Body as NodeJS.ReadableStream;
            const chunks: Buffer[] = [];
            let done, value;
             // Collect data chunks from the stream
            for await (const chunk of stream[Symbol.asyncIterator]()) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            buffer = Buffer.concat(chunks);
        }
        else{
            return { statusCode: 404, body: JSON.stringify({ message: 'package not found' }) };
        }

        const zip = await JSZIP.loadAsync(buffer);
        //content  = zipBuffer.toString('base64');

        let tpackageJsonFile: JSZIP.JSZipObject | null = null;
        zip.forEach((relativePath, file) => {
        if (relativePath.endsWith('package.json')) {
        tpackageJsonFile = zip.file(relativePath); // Capture the relative path to package.json
        }
        });
        const packageJsonFile = tpackageJsonFile;

        if(packageJsonFile){
            const packageJsonContent = await (packageJsonFile as JSZIP.JSZipObject).async('string');
            const packageInfo = JSON.parse(packageJsonContent);
            let packageURL = packageInfo.repository.url;
            line = packageURL;
        }
        else{
            return { statusCode: 404, body: JSON.stringify({ message: 'packageJSON not found' }) };
        }

       }
    } catch (error) {
        console.error("Error during execution:", error);
        return { statusCode: 500, body: "Execution failed" };
    }

    

    try {
        await processUrl(line, index);
        console.log("Process completed.");
        return { statusCode: 200, body: out };
    } catch (error) {
        console.error("Error during execution:", error);
        return { statusCode: 500, body: "Execution failed" };
    }
};



