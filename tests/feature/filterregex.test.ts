import { lambdaHandler } from '../../lambda/byregex'; // Adjust the path
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

describe('lambdaHandler', () => {
  let dynamoDbClientSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on the send method of DynamoDBClient
    dynamoDbClientSpy = jest.spyOn(DynamoDBClient.prototype, 'send');
  });

  afterEach(() => {
    jest.restoreAllMocks(); // Reset all spies after each test
  });

  it('should return 400 if RegEx parameter is missing', async () => {
    const event = {
      body: JSON.stringify({}),
      queryStringParameters: {},
    };

    const result = await lambdaHandler(event as any);

    expect(result).toEqual({
      statusCode: 400,
      body: JSON.stringify({ message: 'RegEx parameter is missing or invalid.' }),
    });
  });

  it('should return 400 if RegEx parameter is invalid', async () => {
    const event = {
      body: JSON.stringify({ RegEx: '[' }),
      queryStringParameters: {},
    };

    const result = await lambdaHandler(event as any);

    expect(result).toEqual({
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid regex.' }),
    });
  });

  it('should return 404 if no items are found in the database', async () => {
    dynamoDbClientSpy.mockResolvedValueOnce({ Items: [] }); // Mock empty result

    const event = {
      body: JSON.stringify({ RegEx: '.*' }),
      queryStringParameters: {},
    };

    const result = await lambdaHandler(event as any);

    console.log(result)

    expect(result).toEqual({
      statusCode: 404,
      body: JSON.stringify({ message: 'No packages found.' }),
    });

  });

  it('should return 200 with filtered results for a valid regex', async () => {
    dynamoDbClientSpy.mockResolvedValueOnce({
      Items: [
        { Name: { S: 'test-package' }, Version: { S: '1.0.0' }, ID: { S: '123' } },
        { Name: { S: 'example-package' }, Version: { S: '2.0.0' }, ID: { S: '456' } },
      ],
    }); // Mock database items

    const event = {
      body: JSON.stringify({ RegEx: '^test' }), // Matches 'test-package'
      queryStringParameters: {},
    };

    const result = await lambdaHandler(event as any);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: [
        { Name: 'test-package', Version: '1.0.0', ID: '123' },
      ],
    });
  });

  it('should return 500 if an internal error occurs', async () => {
    dynamoDbClientSpy.mockRejectedValueOnce(new Error('DynamoDB error')); // Mock an error from DynamoDB

    const event = {
      body: JSON.stringify({ RegEx: '.*' }),
      queryStringParameters: {},
    };

    const result = await lambdaHandler(event as any);

    expect(result).toEqual({
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    });
  });
});
