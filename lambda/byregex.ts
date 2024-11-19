import { APIGatewayProxyEvent } from 'aws-lambda'
import * as AWS from 'aws-sdk'

import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

const dynamoDBclient = new DynamoDBClient({});
const TABLE_NAME = 'PackageInfo';

interface LambdaEvent {
    body: string
    queryStringParameters: any
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

  const params = {
    TableName: TABLE_NAME
  };

  const command = new ScanCommand(params);
  const results = await dynamoDBclient.send(command);
  let regex;
  if (!results.Items || results.Items.length === 0) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'No packages found.' }),
    };
  }
  try{
     regex = new RegExp(regexp, 'i'); // 'i' flag for case-insensitive search
  }catch(err){
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid regex.' }),
    };
  }


const filteredResults = results.Items.filter((item: any) => {
    const nameMatch = regex.test(item.Name);
    return nameMatch;
}).map((item: any) => {
    return {
        Name: item.Name,
        ID: item.ID,
        Version: item.Version
    };
});

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


