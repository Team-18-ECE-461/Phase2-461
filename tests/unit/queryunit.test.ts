import {
    parsetovalidversion,
    buildParams,
    parseCaretVersion,
    parseRange,
    parseTildeVersion,
    versionToInt,
  } from '../../lambda/packages';
  
  describe('Helper Function Tests', () => {
    describe('parsetovalidversion', () => {
      it('should return valid version for a correct schema', () => {
        expect(parsetovalidversion('1.2.3')).toBe('1.2.3');
      });
  
      it('should return valid version after stripping parentheses', () => {
        expect(parsetovalidversion('(1.2.3)')).toBe('1.2.3');
      });
  
      it('should return "Invalid version" for an invalid schema', () => {
        expect(parsetovalidversion('invalid.version')).toBe('Invalid version');
      });
  
      it('should return "Invalid version" for non-numeric parts', () => {
        expect(parsetovalidversion('1.a.3')).toBe('Invalid version');
      });
    });
  
    describe('versionToInt', () => {
      it('should convert a valid version string to an integer', () => {
        expect(versionToInt('1.2.3')).toBe(1002003);
      });
    });
  
    describe('parseRange', () => {
      it('should correctly parse a valid range', () => {
        expect(parseRange('1.2.3-2.3.4')).toEqual([1002003, 2003004]);
      });
  
      it('should handle edge cases with malformed input', () => {
        expect(() => parseRange('invalid-range')).toThrow();
      });
    });
  
    describe('parseCaretVersion', () => {
      it('should parse ^MAJOR.MINOR.PATCH correctly', () => {
        expect(parseCaretVersion('^1.2.3')).toEqual([1002003, 2000000]);
      });
  
      it('should handle ^0.MINOR.PATCH correctly', () => {
        expect(parseCaretVersion('^0.2.3')).toEqual([2003, 3000]);
      });
  
      it('should handle ^0.0.PATCH correctly', () => {
        expect(parseCaretVersion('^0.0.5')).toEqual([5, 6]);
      });
    });
  
    describe('parseTildeVersion', () => {
      it('should parse ~MAJOR.MINOR.PATCH correctly', () => {
        expect(parseTildeVersion('~1.2.3')).toEqual([1002003, 1003000]);
      });
  
      it('should parse ~MAJOR.MINOR correctly', () => {
        expect(parseTildeVersion('~1.2')).toEqual([1002000, 1003000]);
      });
  
      it('should parse ~MAJOR correctly', () => {
        expect(parseTildeVersion('~1')).toEqual([1000000, 2000000]);
      });
    });
  
    describe('buildParams', () => {
      const TABLE_NAME = 'PackageInfo';
      const LIMIT = 10;
  
      it('should build params for exact version', () => {
        const params = buildParams('test-package', '1.2.3', 0, LIMIT);
        expect(params).toEqual({
          TableName: TABLE_NAME,
          KeyConditionExpression: '#name = :name and Version = :version',
          ExpressionAttributeNames: { '#name': 'Name' },
          ExpressionAttributeValues: {
            ':name': { S: 'test-package' },
            ':version': { S: '1.2.3' },
          },
        });
      });
  
      it('should build params for caret version', () => {
        const params = buildParams('test-package', '^1.2.3', 0, LIMIT);
        expect(params).toEqual({
          TableName: TABLE_NAME,
          Limit: LIMIT,
          FilterExpression: 'VersionInt >= :start AND VersionInt < :end',
          ExpressionAttributeValues: {
            ':name': { S: 'test-package' },
            ':start': { N: '1002003' },
            ':end': { N: '2000000' },
          },
          KeyConditionExpression: '#name = :name',
          ExpressionAttributeNames: { '#name': 'Name' },
        });
      });
  
      it('should build params for tilde version', () => {
        const params = buildParams('test-package', '~1.2.3', 0, LIMIT);
        expect(params).toEqual({
          TableName: TABLE_NAME,
          Limit: LIMIT,
          FilterExpression: 'VersionInt >= :start AND VersionInt < :end',
          ExpressionAttributeValues: {
            ':name': { S: 'test-package' },
            ':start': { N: '1002003' },
            ':end': { N: '1003000' },
          },
          KeyConditionExpression: '#name = :name',
          ExpressionAttributeNames: { '#name': 'Name' },
        });
      });
  
      it('should build params for range version', () => {
        const params = buildParams('test-package', '1.2.3-2.3.4', 0, LIMIT);
        expect(params).toEqual({
          TableName: TABLE_NAME,
          Limit: LIMIT,
          FilterExpression: 'VersionInt >= :start AND VersionInt <= :end',
          ExpressionAttributeValues: {
            ':name': { S: 'test-package' },
            ':start': { N: '1002003' },
            ':end': { N: '2003004' },
          },
          KeyConditionExpression: '#name = :name',
          ExpressionAttributeNames: { '#name': 'Name' },
        });
      });
  
      it('should build params for wildcard version', () => {
        const params = buildParams('test-package', '*', 0, LIMIT);
        expect(params).toEqual({
          TableName: TABLE_NAME,
          Limit: LIMIT,
        });
      });
    });
  });
  