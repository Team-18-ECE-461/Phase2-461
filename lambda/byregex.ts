

/**
 * @file byregex.ts
 * 
 * This AWS Lambda function handles HTTP requests to filter package information stored in a DynamoDB table based on a provided regular expression.
 * 
 * The function performs the following steps:
 * 1. Parses the incoming event to extract the regular expression from the request body.
 * 2. Validates the regular expression using the `safe-regex` library to ensure it is safe to use.
 * 3. Compiles the regular expression and scans the DynamoDB table for package items.
 * 4. Filters the scanned results based on the provided regular expression.
 * 5. Returns the filtered results or appropriate error messages if no matches are found or if an error occurs.
 * 
 * The DynamoDB table name is defined as a constant `TABLE_NAME`.
 * 
 * The `filterByRegex` function is a helper function that filters the scanned DynamoDB items based on the provided regular expression.
 * 
 * @module byregex
 * @requires aws-lambda
 * @requires aws-sdk
 * @requires @aws-sdk/client-dynamodb
 * @requires safe-regex
 * @requires readline
 */
import { APIGatewayProxyEvent } from 'aws-lambda'
import * as AWS from 'aws-sdk'

import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import safeRegex from 'safe-regex';
import { Interface } from 'readline';

const dynamoDBclient = new DynamoDBClient({});
const TABLE_NAME = 'PackageInfo';

interface LambdaEvent {
    body: string
    queryStringParameters: any
}
interface PackageItem {
    Name: { S: string }; // Adjust this based on the actual structure of your 'Name' field
    Version?: any;
    ID?: any;
  }
  


export const lambdaHandler = async (event: LambdaEvent) => {
try{
   const body = JSON.parse(event.body);
   const regexp = body.RegEx
   console.log(regexp)

   if (!regexp || !safeRegex(regexp)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'RegEx parameter is missing or invalid.' }),
    };
  }
  let regex;
    try{
        regex = new RegExp(regexp, 'i'); // 'i' flag for case-insensitive search
    }catch(err){
    return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid regex.' }),
    };
    }

  const params = {
    TableName: TABLE_NAME
  };

  const command = new ScanCommand(params);
  const results = await dynamoDBclient.send(command);
  //console.log(results)

  if(results.Count === 0){
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'No packages found.' }),
    };
  }

if (!results.Items) {
  return {
    statusCode: 404,
    body: JSON.stringify({ message: 'No packages found.' }),
  };
}

const filteredResults = filterByRegex(results, regexp);
console.log(filteredResults)

if(filteredResults.length === 0){
  return {
    statusCode: 404,
    body: JSON.stringify({ message: 'No packages found.' }),
  };
}

  const response = {
    statusCode: 200,
    body: JSON.stringify(
     filteredResults,
    ),
  };

  return response;
}
catch (err) {
  console.error(err);
  return {
    statusCode: 500,
    body: JSON.stringify({ message: 'Internal server error' }),
  };
}
}

/**
 * Filters the scanned DynamoDB items based on the provided regular expression.
 * @param scanResult - The result of a DynamoDB scan operation
 * @param regexPattern - The regular expression pattern to filter the items
 * @returns An array of filtered package items
 */
export function filterByRegex(scanResult: any,regexPattern: string): PackageItem[] {
    // Compile the regex pattern
    let regex: RegExp;
    try {
      regex = new RegExp(regexPattern);
    } catch (error) {
      throw new Error("Invalid regex pattern");
    }
  
    // Extract and filter items
    const filteredItems = scanResult.Items?.filter((item:any) => {
      const name = item.Name?.S; // Extract the 'Name' field's value
      return name && regex.test(name);
    }) as PackageItem[]; // Type assertion


     // Transform filtered items to desired format
     if (!filteredItems) {
      return [];}
     const transformedItems = filteredItems.map((item: any) => ({
      Version: item.Version?.S || "N/A",
      Name: item.Name?.S || "N/A",
      ID: item.ID?.S || "N/A", 
    }));



  
    return transformedItems;
  }
  


