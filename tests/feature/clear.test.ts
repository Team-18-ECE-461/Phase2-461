import { resetRegistry } from '../../lambda/reset';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
    DynamoDBClient,
    ScanCommand,
    DeleteItemCommand,
    PutItemCommand,
} from '@aws-sdk/client-dynamodb';

jest.mock('@aws-sdk/client-dynamodb', () => {
    const mockSend = jest.fn();
    return {
        DynamoDBClient: jest.fn(() => ({
            send: mockSend,
        })),
        ScanCommand: jest.fn(),
        DeleteItemCommand: jest.fn(),
        PutItemCommand: jest.fn(),
        __mockSend: mockSend, // Expose mockSend for assertions
    };
});

const mockSend = (DynamoDBClient as any).__mockSend;

describe('resetRegistry', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should clear the table and set the default user', async () => {
        // Mock ScanCommand to return some items
        mockSend.mockImplementation((command: any) => {
            if (command instanceof ScanCommand) {
                return {
                    Items: [
                        { Name: { S: 'Package1' }, Version: { S: '1.0.0' } },
                        { Name: { S: 'Package2' }, Version: { S: '2.0.0' } },
                    ],
                };
            }
            if (command instanceof DeleteItemCommand) {
                return {}; // Simulate successful deletion
            }
            if (command instanceof PutItemCommand) {
                return {}; // Simulate successful put operation
            }
        });

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

        const result: APIGatewayProxyResult = await resetRegistry(testEvent);

        expect(result.statusCode).toBe(200);
        expect(result.body).toContain('Table cleared and default user set successfully.');

        // Ensure ScanCommand was called
        expect(mockSend).toHaveBeenCalledWith(expect.any(ScanCommand));
        // Ensure DeleteItemCommand was called twice (once for each item)
        expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteItemCommand));
        expect(mockSend.mock.calls.filter((call: any) => call[0] instanceof DeleteItemCommand).length).toBe(2);
        // Ensure PutItemCommand was called
        expect(mockSend).toHaveBeenCalledWith(expect.any(PutItemCommand));
    });

    it('should handle errors gracefully', async () => {
        // Mock ScanCommand to throw an error
        mockSend.mockImplementation(() => {
            throw new Error('AccessDeniedException: User is not authorized');
        });

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

        const result: APIGatewayProxyResult = await resetRegistry(testEvent);

        expect(result.statusCode).toBe(500);
        expect(result.body).toContain('Failed to reset table.');
    });
});
