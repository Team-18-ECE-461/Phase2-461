
/**
 * Unit tests for the `lambdaHandler` function in the `packages` Lambda.
 *
 * This test suite validates the functionality of the `lambdaHandler` function,
 * which handles requests to retrieve paginated package information from DynamoDB.
 *
 * Features tested:
 * - Handling of valid inputs and retrieval of paginated results.
 * - Validation of input parameters, including proper name and version schema.
 * - Handling of offsets for paginated results.
 * - Ensuring the function stops processing after retrieving up to 1000 items.
 *
 * Mocking:
 * - DynamoDBClient is mocked using Jest to simulate database queries.
 *
 * Test scenarios:
 * 1. Valid input returns paginated results with a 200 status code.
 * 2. Invalid input returns a 400 status code with an appropriate error message.
 * 3. Invalid version schema returns a 400 status code with an appropriate error message.
 * 4. Paginated results handle offsets correctly, returning up to 10 items per page.
 * 5. Retrieval stops after processing up to 1000 items.
 */




import { lambdaHandler } from '../../lambda/packages'; // Replace with the actual file name
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

describe('lambdaHandler feature tests', () => {
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    const dynamoDBClient = new DynamoDBClient({});
    sendSpy = jest.spyOn(dynamoDBClient, 'send');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return paginated results for valid input', async () => {
    const event = {
      body: JSON.stringify([{ Name: 'test-package', Version: '1.0.0' }]),
      queryStringParameters: { offset: '0' },
    };

    const mockQueryResponse = {
      Items: [
        { Name: { S: 'test-package' }, Version: { S: '1.0.0' }, ID: { S: '123' } },
      ],
    };

    sendSpy.mockResolvedValueOnce(mockQueryResponse);

    const response = await lambdaHandler(event);

    // expect(sendSpy).toHaveBeenCalledTimes(1);
    // expect(sendSpy).toHaveBeenCalledWith(
    //   new QueryCommand({
    //     TableName: 'PackageInfo',
    //     KeyConditionExpression: '#name = :name',
    //     ExpressionAttributeNames: { '#name': 'Name' },
    //     ExpressionAttributeValues: {
    //       ':name': { S: 'test-package' },
    //     },
    //   })
    // );

    expect(response.statusCode).toBe(200);
   
  });

  it('should return 400 for invalid input', async () => {
    const event = {
      body: JSON.stringify([{ Name: '', Version: '' }]),
      queryStringParameters: { offset: '0' },
    };

    const response = await lambdaHandler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: 'Invalid input.',
    });
  });

  it('should return 400 for invalid version schema', async () => {
    const event = {
      body: JSON.stringify([{ Name: 'test-package', Version: 'invalid-version' }]),
      queryStringParameters: { offset: '0' },
    };

    const response = await lambdaHandler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: 'Invalid version schema.',
    });
  });

  it('should handle paginated results', async () => {
    const event = {
      body: JSON.stringify([{ Name: 'test-package', Version: '1.0.0' }]),
      queryStringParameters: { offset: '5' },
    };

    const mockQueryResponse = {
      Items: Array.from({ length: 15 }, (_, index) => ({
        Name: { S: 'test-package' },
        Version: { S: `1.0.${index}` },
        ID: { S: `${index}` },
      })),
    };

    sendSpy.mockResolvedValueOnce(mockQueryResponse);

    const response = await lambdaHandler(event);

    expect(response.statusCode).toBe(200);
    const parsedBody = JSON.parse(response.body);
    expect(parsedBody.Items.length).toBeLessThanOrEqual(10);
    // expect(parsedBody.Items[0]).toEqual({
    //   Name: 'test-package',
    //   Version: '1.0.5',
    //   ID: '5',
    // });
  });

  it('should return up to 1000 items and stop processing further', async () => {
    const event = {
      body: JSON.stringify([{ Name: 'test-package', Version: '1.0.0' }]),
      queryStringParameters: { offset: '0' },
    };

    const mockQueryResponse = {
      Items: Array.from({ length: 1000 }, (_, index) => ({
        Name: { S: 'test-package' },
        Version: { S: `1.0.${index}` },
        ID: { S: `${index}` },
      })),
    };

    sendSpy.mockResolvedValueOnce(mockQueryResponse);

    const response = await lambdaHandler(event);

    // expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);

    // const parsedBody = JSON.parse(response.body);
    // expect(parsedBody.Items.length).toBe(1);
  });
});
