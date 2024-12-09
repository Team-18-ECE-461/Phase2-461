// cost.test.ts

/**
 * Unit tests for the `lambdaHandler` function in the `cost` Lambda.
 *
 * This test suite validates the functionality of the `lambdaHandler` function,
 * which calculates the cost of a package based on its size in S3 and optionally includes the size
 * of its dependencies. It utilizes AWS DynamoDB for metadata and S3 for package data.
 *
 * Features tested:
 * - Proper handling of missing `packageIds` in the request.
 * - Calculation of standalone cost for a package without dependencies.
 * - Calculation of cumulative cost for a package with dependencies.
 * - Error handling for non-existent packages.
 *
 * Mocking:
 * - AWS SDK clients (S3 and DynamoDB) are mocked using Jest to simulate network interactions.
 * - JSZip is mocked to simulate reading and parsing package files.
 */




import { APIGatewayProxyEvent } from 'aws-lambda';
import { lambdaHandler } from '../../lambda/cost';
import { S3, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import JSZip from 'jszip';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('jszip');

const mockedS3 = S3 as jest.MockedClass<typeof S3>;
const mockedDynamoDBClient = DynamoDBClient as jest.MockedClass<typeof DynamoDBClient>;
const MockedJSZip = JSZip as jest.MockedClass<typeof JSZip>;

describe('lambdaHandler', () => {
    let s3SendMock: jest.Mock;
    let dynamoSendMock: jest.Mock;
    let jsZipLoadAsyncMock: jest.Mock;
    let zipMock: { forEach: jest.Mock; file: jest.Mock; async: jest.Mock };

    beforeAll(() => {
        s3SendMock = jest.fn();
        dynamoSendMock = jest.fn();
        jsZipLoadAsyncMock = jest.fn();

        mockedS3.mockImplementation(() => {
            return {
                send: s3SendMock
            } as any;
        });

        mockedDynamoDBClient.mockImplementation(() => {
            return {
                send: dynamoSendMock
            } as any;
        });

        zipMock = {
            forEach: jest.fn(),
            file: jest.fn(),
            async: jest.fn()
        } as any;

        MockedJSZip.mockImplementation((): any => {
            return zipMock;
        });

        (JSZip.loadAsync as unknown as jest.Mock).mockImplementation(jsZipLoadAsyncMock);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    function createMockEvent(body: object): APIGatewayProxyEvent {
        return {
            body: JSON.stringify(body),
            resource: "/cost",
            path: "/cost",
            httpMethod: "POST",
            headers: {},
            multiValueHeaders: {},
            queryStringParameters: null,
            multiValueQueryStringParameters: null,
            pathParameters: {},
            stageVariables: null,
            requestContext: {
                accountId: "123456789012",
                apiId: "testApiId",
                authorizer: {},
                protocol: "HTTP/1.1",
                httpMethod: "POST",
                identity: {
                    accessKey: null,
                    accountId: null,
                    apiKey: null,
                    apiKeyId: null,
                    caller: null,
                    clientCert: null,
                    cognitoAuthenticationProvider: null,
                    cognitoAuthenticationType: null,
                    cognitoIdentityId: null,
                    cognitoIdentityPoolId: null,
                    sourceIp: "127.0.0.1",
                    user: null,
                    userAgent: "jest-test",
                    userArn: null
                },
                path: "/cost",
                stage: "test",
                requestId: "test-request-id",
                requestTimeEpoch: Date.now(),
                resourceId: "resource-id",
                resourcePath: "/cost",
                // The following fields are present in newer versions of APIGatewayProxyEvent but can be empty
                domainName: "",
                domainPrefix: "",
                requestTime: "",
                extendedRequestId: "",
                pathParameters: {},
                messageDirection: "",
                connectedAt: 0,
                connectionId: "",
                eventType: "",
                routeKey: "",
            } as any,
            isBase64Encoded: false
        };
    }

    test('Should return 400 if no packageIds provided', async () => {
        const event = createMockEvent({});
        const result = await lambdaHandler(event);
        expect(result.statusCode).toBe(400);
        expect(result.body).toContain("missing field(s) in the PackageID");
    });

    test('Should return standalone cost for a given package with no dependencies', async () => {
        // Mock DynamoDB response
        dynamoSendMock.mockResolvedValueOnce({
            Items: [{
                Name: { S: "test-package" },
                Version: { S: "1.0.0" },
                URL: { S: "http://example.com/test-package-1.0.0.zip" }
            }]
        });

        // Mock S3 GetObject response (returning package.json in a zip)
        const s3Body = Buffer.from('dummy-zip-content');
        s3SendMock.mockImplementation((command) => {
            if (command instanceof GetObjectCommand) {
                return Promise.resolve({
                    Body: s3Body
                });
            }
            if (command instanceof HeadObjectCommand) {
                return Promise.resolve({
                    ContentLength: 12345
                });
            }
            return Promise.reject("Unknown S3 command");
        });

        // Mock JSZip
        const packageJsonContent = JSON.stringify({
            name: "test-package",
            version: "1.0.0"
        });
        // Simulate that "forEach" finds a package.json file
        zipMock.forEach.mockImplementation((cb: (relativePath: string, file: any) => void) => {
            cb('package.json', { async: jest.fn().mockResolvedValue(packageJsonContent) });
        });
        jsZipLoadAsyncMock.mockResolvedValue(zipMock);

        const event = createMockEvent({
            packageIds: ["12345"]
        });

        const result = await lambdaHandler(event);
        expect(result.statusCode).toBe(200);
        const parsedBody = JSON.parse(result.body);
        expect(parsedBody["12345"].standaloneCost).toBe(12345);
        expect(parsedBody["12345"].totalCost).toBe(12345); // dependency = false by default
    });

    test('Should return cumulative cost when dependencies are requested', async () => {
        // Set up package with a dependency
        dynamoSendMock
            .mockResolvedValueOnce({ // For main package
                Items: [{
                    Name: { S: "test-package" },
                    Version: { S: "1.0.0" },
                    URL: { S: "http://example.com/test-package-1.0.0.zip" }
                }]
            })
            .mockResolvedValueOnce({ // For dependency package
                Items: [{
                    Name: { S: "dep-package" },
                    Version: { S: "2.0.0" },
                    URL: { S: "http://example.com/dep-package-2.0.0.zip" }
                }]
            });

        // Main package S3 responses
        s3SendMock.mockImplementation((command) => {
            if (command instanceof GetObjectCommand) {
                // Both main package and dependency return a zip
                return Promise.resolve({ Body: Buffer.from('zip-data') });
            }
            if (command instanceof HeadObjectCommand) {
                if (command.input.Key === "test-package-1.0.0") return Promise.resolve({ ContentLength: 1000 });
                if (command.input.Key === "dep-package-2.0.0") return Promise.resolve({ ContentLength: 500 });
            }
            return Promise.reject("Unknown command");
        });

        // Main package.json with a dependency
        const mainPackageJson = JSON.stringify({
            name: "test-package",
            version: "1.0.0",
            dependencies: {
                "dep-package": "2.0.0"
            }
        });

        // Dependency package.json with no further dependencies
        const depPackageJson = JSON.stringify({
            name: "dep-package",
            version: "2.0.0"
        });

        let zipCalls = 0;
        zipMock.forEach.mockImplementation((cb: (relativePath: string, file: any) => void) => {
            // First call: main package
            if (zipCalls === 0) {
                cb('package.json', { async: jest.fn().mockResolvedValue(mainPackageJson) });
            } else {
                cb('package.json', { async: jest.fn().mockResolvedValue(depPackageJson) });
            }
            zipCalls++;
        });
        jsZipLoadAsyncMock.mockResolvedValue(zipMock);

        const event = createMockEvent({
            packageIds: ["main-package-id"],
            dependency: true
        });

        const result = await lambdaHandler(event);
        expect(result.statusCode).toBe(200);
        const parsedBody = JSON.parse(result.body);

        // main package size = 1000, dep-package size = 500
        expect(parsedBody["main-package-id"].standaloneCost).toBe(1000);
        expect(parsedBody["main-package-id"].totalCost).toBe(1500);
    });

    test('Should return 404 if package not found', async () => {
        // DynamoDB returns empty Items
        dynamoSendMock.mockResolvedValueOnce({ Items: [] });

        const event = createMockEvent({
            packageIds: ["non-existent-package"]
        });

        const result = await lambdaHandler(event);
        expect(result.statusCode).toBe(404);
        expect(result.body).toContain("Package does not exist.");
    });
});
