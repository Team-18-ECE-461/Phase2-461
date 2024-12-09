/**
 * Unit tests for the `lambdaHandler` function in the `byregex` Lambda.
 *
 * This test suite validates the functionality of the `lambdaHandler` function,
 * which queries DynamoDB for items matching a specified regular expression pattern
 * and returns filtered results.
 *
 * Features tested:
 * - Proper handling of missing or invalid `RegEx` parameters in the request.
 * - Handling of cases where no items are found in the database.
 * - Successful return of filtered results for valid regex queries.
 * - Graceful handling of internal server errors, including DynamoDB failures.
 *
 * Mocking:
 * - DynamoDBClient is mocked using Jest to simulate database interactions.
 *
 * Test scenarios:
 * 1. Missing `RegEx` parameter returns a 400 status code.
 * 2. Invalid `RegEx` parameter returns a 400 status code.
 * 3. No items matching the query return a 404 status code.
 * 4. Valid `RegEx` parameter returns filtered results with a 200 status code.
 * 5. Internal server errors return a 500 status code.
 */




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
