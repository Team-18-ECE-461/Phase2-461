import { Manager } from './manager'
import { exec } from 'child_process'
import { Metrics } from './calc_metrics'
import * as database from './database'
import { Controller } from './controller'
import { OutputMetrics } from './output_metrics'
import { UrlHandler } from './url_handler'
import fs from 'fs'
import path from 'path'
import { log } from 'console'
import JSZIP from 'jszip';
import { S3, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
const s3 = new S3();
const dynamoDBclient = new DynamoDBClient({});
const BUCKET_NAME = 'packagesstorage';
const TABLE_NAME = 'PackageInfo';


// Getting environment variables for logfile and logLvl
let logfile = process.env.LOG_FILE as string;
let logLvl = process.env.LOG_LEVEL as string;

// Check if the logfile is given and if there is a GITHUB_TOKEN. Exiting and writing an error message if they don't exist
if(!logfile) {
    logfile = "app.log";
    console.error("No logfile given");
    //process.exit(1);
}


// If logLvl wasn't set, it is set to 0 by default
if(!logLvl) {
    logLvl = "0";
}

const logDir = path.dirname(logfile);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Opening logfile
const fp = fs.openSync(logfile, 'w');

let line = 'https://www.npmjs.com/package/minify'
let out :any;
let index = 0;
const db = database.createConnection(fp, +logLvl);
const metric_calc = new Metrics(db, fp, +logLvl);
const output_metrics = new OutputMetrics(db, 1, fp, +logLvl);
const urlHandler = new UrlHandler(db, fp, +logLvl);
database.createTable(db, fp, +logLvl);

async function processUrl(line: string, index: number) {
    await database.addEntry(db, line, fp, +logLvl);
    console.log("added entry")
    await urlHandler.main(index + 1);
    console.log("url handler")
    await metric_calc.calc(index + 1);
    console.log("metric calc")
    out = await output_metrics.output_Metrics(index + 1);
    console.log("output metrics")
}
interface LamdaEvent {
    body: string;
    pathParameters: { id: string },
}


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

        if(packageURL.length > 0) {
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
        }
        else{
            return { statusCode: 404, body: JSON.stringify({ message: 'packageJSON not found' }) };
        }
        line = packageURL;

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



