/**
 * Unit tests for the `filterByRegex` function in the `byregex` module.
 *
 * This test suite validates the functionality of the `filterByRegex` function,
 * which filters DynamoDB scan results based on a given regular expression pattern.
 *
 * Features tested:
 * - Filtering items that match a specific regex pattern.
 * - Handling scenarios where no items match the regex.
 * - Handling edge cases with undefined or empty `Items` in the scan result.
 *
 * Test scenarios:
 * - Valid regex patterns that successfully filter matching items.
 * - Scenarios where no items match the provided regex pattern.
 * - Handling of empty or undefined `Items` arrays in the scan result.
 */





import { filterByRegex } from '../../lambda/byregex';

interface PackageItem {
  Name: string;
  Version: string;
  ID: string;
}



describe("filterByRegex", () => {
  const mockScanResult = {
    Items: [
      { Name: { S: "package1" }, Version: { S: "1.0.0" }, ID: { S: "123" } },
      { Name: { S: "test-package" }, Version: { S: "2.0.0" }, ID: { S: "456" } },
      { Name: { S: "example" }, Version: { S: "3.0.0" }, ID: { S: "789" } },
    ],
  };

  it("should filter items based on a valid regex pattern", () => {
    const regexPattern = "test"; // Matches "test-package"
    const result = filterByRegex(mockScanResult, regexPattern);

    expect(result).toEqual([
      { Name: "test-package", Version: "2.0.0", ID: "456" },
    ]);
  });

  it("should return an empty array if no items match the regex pattern", () => {
    const regexPattern = "nonexistent";
    const result = filterByRegex(mockScanResult, regexPattern);

    expect(result).toEqual([]);
  });



  it("should return an empty array if Items is undefined", () => {
    const emptyScanResult = {};
    const regexPattern = ".*"; // Match all

    const result = filterByRegex(emptyScanResult, regexPattern);

    expect(result).toEqual([]);
  });

  it("should handle a scan result with an empty Items array", () => {
    const emptyItemsScanResult = { Items: [] };
    const regexPattern = ".*"; // Match all

    const result = filterByRegex(emptyItemsScanResult, regexPattern);

    expect(result).toEqual([]);
  });
});
