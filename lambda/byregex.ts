import { APIGatewayProxyEvent } from 'aws-lambda'
import * as AWS from 'aws-sdk'

import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

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

   if (!regexp || !/^[a-zA-Z0-9_]+$/.test(regexp)) {
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
  
  if (!results.Items || results.Items.length === 0) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'No packages found.' }),
    };
  }
 


const filteredResults = filterByRegex(results, regexp);

  const response = {
    statusCode: 200,
    body: JSON.stringify({
      items: filteredResults,
    }),
  };

  return response;
}
catch (err) {
  return {
    statusCode: 500,
    body: JSON.stringify({ message: 'Internal server error' }),
  };
}
}

function filterByRegex(scanResult: any,regexPattern: string): PackageItem[] {
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
  
    return filteredItems || [];
  }
  


