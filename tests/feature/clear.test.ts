import {resetRegistry} from '../../lambda/reset';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, ScanCommand, DeleteItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';


describe('resetRegistry', () => {
    it('should clear the table and set the default user', async () => {
        const testEvent: APIGatewayProxyEvent = {
            body: null,
            headers: {},
            httpMethod: 'DEL',
            isBase64Encoded: false,
            path: '/reset',
            pathParameters: null,
            queryStringParameters: null,
            multiValueHeaders: {},
            multiValueQueryStringParameters: null,
            requestContext: {} as any,
            resource: '/reset',
            stageVariables: null,
        };

        const result = await resetRegistry(testEvent);

        expect(result.statusCode).toBe(200);
        expect(result.body).toContain('Table cleared and default user set successfully.');
    });
});

