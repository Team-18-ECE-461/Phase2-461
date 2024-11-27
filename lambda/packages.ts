import { S3, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { version } from 'os';

const s3 = new S3();
const dynamoDBclient = new DynamoDBClient({});
const BUCKET_NAME = 'packagesstorage';
const TABLE_NAME = 'PackageInfo';

interface LambdaEvent {
    body: string
    queryStringParameters: any
}

export const lambdaHandler = async (event: LambdaEvent) => {
    const body = JSON.parse(event.body);
    const soff = event.queryStringParameters.offset || {}; 
    const offset = Number(soff);
    let totalresults = []
    const limit = 10

    

    for (const query of body){
        let name = query.Name;
        let versionSchema = query.Version;
        versionSchema = parsetovalidversion(versionSchema);
        if(versionSchema === 'Invalid version'){
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid version schema.' }),
            };
        }

       
        let queryParams = buildParams(name, versionSchema, offset, limit);
        

        const data = await dynamoDBclient.send(new QueryCommand(queryParams));
        
        
        const items = (data.Items || []).map(item => {
            return {
                Name: item.Name.S,
                Version: item.Version.S,
                ID: item.ID.S,
            }
        });

        totalresults.push(...items);
        if(totalresults.length >= 1000){
            break;
        }

    }

    const length = totalresults.length;
    let paginatedResults = [];

    if(offset + limit < length){   
        paginatedResults = totalresults.slice(offset, offset + limit);
    }
    else {
        paginatedResults = totalresults.slice(offset, length);
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            Items: paginatedResults
           
        })
    }

    

}

function parsetovalidversion(versionSchema: string): string{
    if(versionSchema.includes('(') && versionSchema.includes(')')){
        versionSchema = versionSchema.slice(1, -1);
    }
    let major, minor, patch;
    [major, minor, patch] = versionSchema.split('.').map(Number);
    if(isNaN(major) || isNaN(minor) || isNaN(patch)){
        return 'Invalid version';
    }
    return versionSchema;
}

function buildParams(name: string, versionSchema: string, offset: any, limit: number) {
    

    if(versionSchema === '*'){
        let params2 = {
            TableName: TABLE_NAME,
            Limit: limit, 
        };
        return params2;
    }

   
    
    if (versionSchema.includes('^')) {
        
        const [start, end] = parseCaretVersion(versionSchema);
        let params2 = {
            TableName: TABLE_NAME,
            Limit: limit,
            FilterExpression: "VersionInt >= :start AND VersionInt < :end",
            ExpressionAttributeValues: {
                ':name': { S: name },
                ':start': { N: start.toString() },
                ':end': { N: end.toString() },

            },
            KeyConditionExpression: "#name = :name",
            ExpressionAttributeNames: { "#name": "Name"},

        }
        return params2;
        }
    else if(versionSchema.includes('-')){
        const [start, end] = parseRange(versionSchema);
        let params2 = {
            TableName: TABLE_NAME,
            Limit: limit,
            FilterExpression: "VersionInt >= :start AND VersionInt <= :end",
            ExpressionAttributeValues: {
                ':name': { S: name },
                ':start': { N: start.toString() },
                ':end': { N: end.toString() },

            },
            KeyConditionExpression: "#name = :name",
            ExpressionAttributeNames: { "#name": "Name"},

        }
        return params2;
    }
    else if(versionSchema.includes('~')){
        const [start, end] = parseTildeVersion(versionSchema);
        let params2 = {
            TableName: TABLE_NAME,
            Limit: limit,
            FilterExpression: "VersionInt >= :start AND VersionInt < :end",
            ExpressionAttributeValues: {
                ':name': { S: name },
                ':start': { N: start.toString() },
                ':end': { N: end.toString() },

            },
            KeyConditionExpression: "#name = :name",
            ExpressionAttributeNames: { "#name": "Name"},

        }
        return params2;
    }
    else{
        const version = versionSchema
        let params3 = {
            TableName: TABLE_NAME,
            KeyConditionExpression: '#name = :name and Version = :version',
            ExpressionAttributeNames: {
                '#name': 'Name',  // Alias for reserved keyword 'Name'
            },
            ExpressionAttributeValues: {
                ':name': { S: name },
                ':version': { S: version },
            },
        }
        return params3;
    }
        
    
}

const versionToInt = (version: string) => {
    const [major, minor, patch] = version.split('.').map(Number);
    return major * 1000000 + minor * 1000 + patch;}

const parseRange = (range: string) => {
    const strippedInput = range
    let [start, end] = strippedInput.split('-');
    const s  = versionToInt(start);
    const e = versionToInt(end);
    return [s, e];
}

function parseCaretVersion(versionSchema: string) {
    versionSchema = versionSchema.slice(1);
    const [major, minor, patch] = versionSchema.split('.').map(Number);

    // Convert the start version to integer
    const start = major * 1000000 + minor * 1000 + patch;

    let end;

    if (major > 0) {
        // ^MAJOR.MINOR.PATCH means < (MAJOR + 1).0.0
        end = (major + 1) * 1000000;
    } else if (minor > 0) {
        // ^0.MINOR.PATCH means < 0.(MINOR + 1).0
        end = major * 1000000 + (minor + 1) * 1000;
    } else {
        // ^0.0.PATCH means < 0.0.(PATCH + 1)
        end = major * 1000000 + minor * 1000 + (patch + 1);
    }

    return [start,end] ;
}

function parseTildeVersion(versionSchema:string) {
    versionSchema = versionSchema.slice(1);
    const parts = versionSchema.split('.').map(Number);
    const major = parts[0] || 0;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;

    const start = major * 1000000 + minor * 1000 + patch;

    let end;

    // Define the upper bound based on tilde logic
    if (parts.length === 3) {
        // ~MAJOR.MINOR.PATCH means < MAJOR.(MINOR + 1).0
        end = major * 1000000 + (minor + 1) * 1000;
    } else if (parts.length === 2) {
        // ~MAJOR.MINOR means < MAJOR.(MINOR + 1).0
        end = major * 1000000 + (minor + 1) * 1000;
    } else {
        // ~MAJOR means < (MAJOR + 1).0.0
        end = (major + 1) * 1000000;
    }

    return [ start, end];
}
