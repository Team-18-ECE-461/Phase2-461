/*


import { Metrics } from '../metrics/calc_metrics'; // Adjust the path accordingly
import * as updateEntry from '../metrics/database'; // Adjust the path as needed
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import * as fs from 'fs';

// Mock the database and filesystem modules
jest.mock('better-sqlite3');
jest.mock('fs');
jest.mock('performance-now', () => jest.fn(() => 100)); // Mock now() to always return 100

// Mock the database
const mockDatabase = {
  prepare: jest.fn().mockReturnValue({
    all: jest.fn(),
  }),
  run: jest.fn(),
};

// Mock the file system functions using spyOn
jest.spyOn(fs, 'writeFileSync').mockImplementation(jest.fn());

describe('Metrics Class Tests', () => {
  let metrics: Metrics;
  let db: Database.Database;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    db = mockDatabase as unknown as Database.Database;
    metrics = new Metrics(db, 1, 1);

    // Mock process.exit
    mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error(`process.exit called with code ${code}`);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize the Metrics instance correctly', () => {
    expect(metrics).toBeInstanceOf(EventEmitter);
    expect(metrics['done']).toBe(false);
    expect(metrics['fp']).toBe(1);
    expect(metrics['loglvl']).toBe(1);
  });

  test('should parse the row data correctly in _calc_callback()', () => {
    const row = {
      id: 1,
      url: 'https://example.com',
      information: '{"top3": 10, "commits/yr": 100, "downloads": 500000}',
      metrics: null,
    };

    (metrics as any)._calc_callback(row); // Use 'any' to bypass access to the private method

    const parsedMap = new Map([
      ['top3', 10],
      ['commits/yr', 100],
      ['downloads', 500000],
    ]);

    expect(metrics['_info'].get('https://example.com')).toEqual(parsedMap);
  });

  test('should calculate the bus factor correctly in _busFactor()', () => {
    const packageInfo = new Map<string, number>([
      ['top3', 10],
      ['commits/yr', 100],
    ]);

    const metricsMap = new Map<string, number>();
    const busFactor = (metrics as any)._busFactor(packageInfo, metricsMap);

    expect(busFactor).toBe(0.9); // 1 - (10 / 100)
    expect(metricsMap.get('BusFactor')).toBe(0.9);
  });

  test('should calculate net score correctly', () => {
    const bus = 0.9;
    const correctness = 0.8;
    const rampUp = 0.7;
    const responsiveness = 1.0;
    const license = 1.0;

    const netScore = (metrics as any)._netScore(bus, correctness, rampUp, responsiveness, license);
    expect(netScore).toBe(0.87); // Check your expected weighted average formula
  });

  test('should handle database errors and log errors correctly in _calc_callback()', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const faultyRow = {
      id: 1,
      url: 'https://example.com',
      information: '{invalid json}', // Bad JSON data
      metrics: null,
    };

    expect(() => (metrics as any)._calc_callback(faultyRow as any)).toThrow('process.exit called with code 1');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error parsing information'));
  });

  test('should calculate responsiveness correctly', () => {
    const packageInfo = new Map<string, number>([
      ['iss3', 5],
      ['iss7', 3],
      ['iss14', 1],
      ['iss31', 2],
      ['issuesOpenedYr', 10],
    ]);
  
    const metricsMap = new Map<string, number>();
    const responsiveness = (metrics as any)._responsiveness(packageInfo, metricsMap);
  
    expect(responsiveness).toBe(0.77); // (5 + 3 * 0.7 + 1 * 0.4 + 2 * 0.1) / 10
    expect(metricsMap.get('ResponsiveMaintainer')).toBe(0.77);
  });
  
  test('should calculate ramp-up correctly', () => {
    const packageInfo = new Map<string, number>([
      ['downloads', 600000],
    ]);
  
    const metricsMap = new Map<string, number>();
    const rampUp = (metrics as any)._rampUp(packageInfo, metricsMap);
  
    expect(rampUp).toBe(0.9); // 500k-1.2M downloads results in 0.6 score
    expect(metricsMap.get('RampUp')).toBe(0.9);
  });
    
  test('should calculate correctness correctly', () => {
    const packageInfo = new Map<string, number>([
      ['issuesClosedYr', 5],
      ['issuesOpenedYr', 10],
    ]);
  
    const metricsMap = new Map<string, number>();
    const correctness = (metrics as any)._correctness(packageInfo, metricsMap);
  
    expect(correctness).toBe(0.5); // 5 resolved issues out of 10 total
    expect(metricsMap.get('Correctness')).toBe(0.5);
  });
  
  test('should handle missing data gracefully in _busFactor()', () => {
    const packageInfo = new Map<string, number>([
      // Missing 'commits/yr'
      ['top3', 10],
    ]);
  
    const metricsMap = new Map<string, number>();
    expect(() => (metrics as any)._busFactor(packageInfo, metricsMap)).toThrow('process.exit called with code 1');
  });
  
  test('should handle missing data gracefully in _rampUp()', () => {
    const packageInfo = new Map<string, number>(); // No 'downloads' key
  
    const metricsMap = new Map<string, number>();
    expect(() => (metrics as any)._rampUp(packageInfo, metricsMap)).toThrow('process.exit called with code 1');
  });

// Mock the database and filesystem modules
jest.mock('better-sqlite3');
jest.mock('fs');
jest.mock('performance-now', () => jest.fn(() => 100)); // Mock now() to always return 100

// Mock the database
const mockDatabase = {
    prepare: jest.fn().mockReturnValue({
        all: jest.fn(),
    }),
    run: jest.fn(),
};

// Mock the file system functions using spyOn
jest.spyOn(fs, 'writeFileSync').mockImplementation(jest.fn());

describe('Metrics Class Tests', () => {
    let metrics: Metrics;
    let db: Database.Database;

    beforeEach(() => {
        db = mockDatabase as unknown as Database.Database;
        metrics = new Metrics(db, 1, 1);

        
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should initialize the Metrics instance correctly', () => {
        expect(metrics).toBeInstanceOf(EventEmitter);
        expect(metrics['done']).toBe(false);
        expect(metrics['fp']).toBe(1);
        expect(metrics['loglvl']).toBe(1);
    });

    test('should parse the row data correctly in _calc_callback()', () => {
        const row = {
            id: 1,
            url: 'https://example.com',
            information: '{"top3": 10, "commits/yr": 100, "downloads": 500000}',
            metrics: null,
        };

        (metrics as any)._calc_callback(row); // Use 'any' to bypass access to the private method

        const parsedMap = new Map([
            ['top3', 10],
            ['commits/yr', 100],
            ['downloads', 500000],
        ]);

        expect(metrics['_info'].get('https://example.com')).toEqual(parsedMap);
    });

    test('should calculate the bus factor correctly in _busFactor()', () => {
        const packageInfo = new Map<string, number>([
            ['top3', 10],
            ['commits/yr', 100],
        ]);

        const metricsMap = new Map<string, number>();
        const busFactor = (metrics as any)._busFactor(packageInfo, metricsMap);

        expect(busFactor).toBe(0.9); // 1 - (10 / 100)
        expect(metricsMap.get('BusFactor')).toBe(0.9);
    });

    test('should calculate net score correctly', () => {
        const bus = 0.9;
        const correctness = 0.8;
        const rampUp = 0.7;
        const responsiveness = 1.0;
        const license = 1.0;

        const netScore = (metrics as any)._netScore(bus, correctness, rampUp, responsiveness, license);
        expect(netScore).toBe(0.87); // Check your expected weighted average formula
    });

    test('should handle database errors and log errors correctly in _calc_callback()', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const faultyRow = {
            id: 1,
            url: 'https://example.com',
            information: '{invalid json}', // Bad JSON data
            metrics: null,
        };

        expect(() => (metrics as any)._calc_callback(faultyRow as any)).toThrow('process.exit called with code 1');
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error parsing information'));
    });

    test('should calculate responsiveness correctly', () => {
        const packageInfo = new Map<string, number>([
            ['iss3', 5],
            ['iss7', 3],
            ['iss14', 1],
            ['iss31', 2],
            ['issuesOpenedYr', 10],
        ]);
    
        const metricsMap = new Map<string, number>();
        const responsiveness = (metrics as any)._responsiveness(packageInfo, metricsMap);
    
        expect(responsiveness).toBe(0.77); // (5 + 3 * 0.7 + 1 * 0.4 + 2 * 0.1) / 10
        expect(metricsMap.get('ResponsiveMaintainer')).toBe(0.77);
    });
    
    test('should calculate ramp-up correctly', () => {
        const packageInfo = new Map<string, number>([
            ['downloads', 600000],
        ]);
    
        const metricsMap = new Map<string, number>();
        const rampUp = (metrics as any)._rampUp(packageInfo, metricsMap);
    
        expect(rampUp).toBe(0.9); // 500k-1.2M downloads results in 0.9 score
        expect(metricsMap.get('RampUp')).toBe(0.9);
    });
        
    test('should calculate correctness correctly', () => {
        const packageInfo = new Map<string, number>([
            ['issuesClosedYr', 5],
            ['issuesOpenedYr', 10],
        ]);
    
        const metricsMap = new Map<string, number>();
        const correctness = (metrics as any)._correctness(packageInfo, metricsMap);
    
        expect(correctness).toBe(0.5); // 5 resolved issues out of 10 total
        expect(metricsMap.get('Correctness')).toBe(0.5);
    });
    
    test('should handle missing data gracefully in _busFactor()', () => {
        const packageInfo = new Map<string, number>([
            // Missing 'commits/yr'
            ['top3', 10],
        ]);
    
        const metricsMap = new Map<string, number>();
        expect(() => (metrics as any)._busFactor(packageInfo, metricsMap)).toThrow('process.exit called with code 1');
    });
    
    test('should handle missing data gracefully in _rampUp()', () => {
        const packageInfo = new Map<string, number>(); // No 'downloads' key
    
        const metricsMap = new Map<string, number>();
        expect(() => (metrics as any)._rampUp(packageInfo, metricsMap)).toThrow('process.exit called with code 1');
    });

    test('should calculate and store metrics correctly in _calculateMetrics()', () => {
        const parsedMap = new Map<string, number>([
            ['top3', 10],
            ['commits/yr', 100],
            ['downloads', 600000],
            ['iss3', 5],
            ['iss7', 3],
            ['iss14', 1],
            ['iss31', 2],
            ['issuesOpenedYr', 10],
            ['issuesClosedYr', 5],
            ['License', 1],
        ]);
    
        metrics['_info'].set('https://example.com', parsedMap);
    
        // Spy on database.updateEntry
        const dbUpdateSpy = jest.spyOn(updateEntry, 'updateEntry').mockImplementation(() => {});
    
        // Call _calculateMetrics
        expect(() => {
            (metrics as any)._calculateMetrics();
        }).not.toThrow();
    
        // Check that updateEntry was called once
        expect(dbUpdateSpy).toHaveBeenCalledTimes(1);
    
        // Check that updateEntry was called with correct parameters
        expect(dbUpdateSpy).toHaveBeenCalledWith(
            metrics['_db'],
            'https://example.com',
            metrics['fp'],
            metrics['loglvl'],
            undefined,
            expect.any(String)
        );
    
        // Get the metrics JSON string from the updateEntry call
        const updateEntryArgs = dbUpdateSpy.mock.calls[0];
        const metricsJsonString = updateEntryArgs[5];
        if (!metricsJsonString) {
            throw new Error('metricsJsonString is undefined');
        }
        const metricsObject = JSON.parse(metricsJsonString);
    
        // Check the calculated metrics
        expect(metricsObject.BusFactor).toBeCloseTo(0.9);
        expect(metricsObject.Correctness).toBeCloseTo(0.5);
        expect(metricsObject.RampUp).toBeCloseTo(0.9);
        expect(metricsObject.ResponsiveMaintainer).toBeCloseTo(0.77);
        expect(metricsObject.License).toBe(1);
    
        // Calculate expected NetScore
        const expectedNetScore =
            (0.1 * 0.9 + 0.3 * 0.5 + 0.2 * 0.9 + 0.4 * 0.77) * 1; // License factor is 1
        expect(metricsObject.NetScore).toBeCloseTo(expectedNetScore);
    
        // Ensure that metrics.done is true
        expect(metrics.done).toBe(true);
    });
});
});

*/


import { Metrics } from '../metrics/calc_metrics'; // Adjust the path accordingly
import * as database from '../metrics/database'; // Adjust the path as needed
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import now from 'performance-now';

// Mock dependencies
jest.mock('better-sqlite3');
jest.mock('fs');
jest.mock('performance-now', () => jest.fn(() => 100)); // Mock now() to always return 100
jest.spyOn(database, 'updateEntry').mockImplementation(jest.fn());

// Mock the database
const mockDatabase = {
    prepare: jest.fn().mockReturnValue({
        all: jest.fn(),
    }),
    run: jest.fn(),
};

// Mock `fs.writeFileSync` to prevent actual file operations
jest.spyOn(fs, 'writeFileSync').mockImplementation(jest.fn());

describe('Metrics Class Tests', () => {
    let metrics: Metrics;
    let db: Database.Database;
    let mockExit: jest.SpyInstance;

    beforeEach(() => {
        db = mockDatabase as unknown as Database.Database;
        metrics = new Metrics(db, 1, 1);

        // Mock process.exit to prevent test termination
        mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
            throw new Error(`process.exit called with code ${code}`);
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should initialize the Metrics instance correctly', () => {
        expect(metrics).toBeInstanceOf(EventEmitter);
        expect(metrics['done']).toBe(false);
        expect(metrics['fp']).toBe(1);
        expect(metrics['loglvl']).toBe(1);
    });

    test('should process row data correctly in _calc_callback()', () => {
        const row = {
            id: 1,
            url: 'https://example.com',
            information: '{"top3": 10, "commits/yr": 100, "downloads": 500000}',
            metrics: null,
        };

        (metrics as any)._calc_callback(row); // Access the private method

        const expectedMap = new Map([
            ['top3', 10],
            ['commits/yr', 100],
            ['downloads', 500000],
        ]);

        expect(metrics['_info'].get('https://example.com')).toEqual(expectedMap);
    });

    test('should handle invalid JSON in _calc_callback()', () => {
        const faultyRow = {
            id: 1,
            url: 'https://example.com',
            information: '{invalid json}', // Invalid JSON
            metrics: null,
        };

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => (metrics as any)._calc_callback(faultyRow)).toThrow('process.exit called with code 1');
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error parsing information'));

        consoleSpy.mockRestore();
    });

    test('should calculate bus factor correctly in _busFactor()', () => {
        const packageInfo = new Map([
            ['top3', 10],
            ['commits/yr', 100],
        ]);

        const metricsMap = new Map();
        const result = (metrics as any)._busFactor(packageInfo, metricsMap);

        expect(result).toBe(0.9); // 1 - (10 / 100)
        expect(metricsMap.get('BusFactor')).toBe(0.9);
    });

    test('should calculate correctness correctly in _correctness()', () => {
        const packageInfo = new Map([
            ['issuesClosedYr', 5],
            ['issuesOpenedYr', 10],
        ]);

        const metricsMap = new Map();
        const result = (metrics as any)._correctness(packageInfo, metricsMap);

        expect(result).toBe(0.5); // 5 resolved issues out of 10 total
        expect(metricsMap.get('Correctness')).toBe(0.5);
    });

    test('should calculate ramp-up correctly in _rampUp()', () => {
        const packageInfo = new Map([['downloads', 600000]]);

        const metricsMap = new Map();
        const result = (metrics as any)._rampUp(packageInfo, metricsMap);

        expect(result).toBe(0.9); // Downloads in range 500k-1.2M
        expect(metricsMap.get('RampUp')).toBe(0.9);
    });

    test('should calculate responsiveness correctly in _responsiveness()', () => {
        const packageInfo = new Map([
            ['iss3', 5],
            ['iss7', 3],
            ['iss14', 1],
            ['iss31', 2],
            ['issuesClosedYr', 10],
        ]);

        const metricsMap = new Map();
        const result = (metrics as any)._responsiveness(packageInfo, metricsMap);

        expect(result).toBe(0.77); // Weighted average
        expect(metricsMap.get('ResponsiveMaintainer')).toBe(0.77);
    });

    test('should calculate and store metrics correctly in _calculateMetrics()', () => {
      const packageInfo = new Map([
          ['top3', 10],
          ['commits/yr', 100],
          ['downloads', 600000],
          ['iss3', 5],
          ['iss7', 3],
          ['iss14', 1],
          ['iss31', 2],
          ['issuesClosedYr', 10],
          ['License', 1],
      ]);
  
      metrics['_info'].set('https://example.com', packageInfo);
  
      const dbUpdateSpy = jest.spyOn(database, 'updateEntry').mockImplementation(jest.fn());
  
      // Call _calculateMetrics
      (metrics as any)._calculateMetrics();
  
      expect(dbUpdateSpy).toHaveBeenCalledTimes(1);
      expect(dbUpdateSpy).toHaveBeenCalledWith(
          metrics['_db'],
          'https://example.com',
          metrics['fp'],
          metrics['loglvl'],
          undefined,
          expect.any(String)
      );
  
      // Check if the 5th argument exists and is valid
      const updateCall = dbUpdateSpy.mock.calls[0];
      if (!updateCall || !updateCall[5]) {
          throw new Error('updateEntry was not called with the expected arguments');
      }
  
      const metricsJsonString = updateCall[5];
      let metricsJson: any;
      try {
          metricsJson = JSON.parse(metricsJsonString);
      } catch (e) {
          throw new Error(`Invalid JSON: ${metricsJsonString}`);
      }
  
      // Check the calculated metrics
      expect(metricsJson.BusFactor).toBeCloseTo(0.9);
      expect(metricsJson.Correctness).toBeCloseTo(0.5);
      expect(metricsJson.RampUp).toBeCloseTo(0.9);
      expect(metricsJson.ResponsiveMaintainer).toBeCloseTo(0.77);
  
      // Calculate expected NetScore
      const expectedNetScore =
          (0.1 * 0.9 + 0.3 * 0.5 + 0.2 * 0.9 + 0.4 * 0.77) * 1; // License factor is 1
      expect(metricsJson.NetScore).toBeCloseTo(expectedNetScore);
  
      // Ensure that metrics.done is true
      expect(metrics.done).toBe(true);
  });
  
    test('should emit "done" event after calc()', (done) => {
        const mockRows = [
            {
                id: 1,
                url: 'https://example.com',
                information: '{"top3": 10, "commits/yr": 100, "downloads": 500000}',
                metrics: null,
            },
        ];

        (db.prepare as jest.Mock).mockReturnValue({
            all: jest.fn().mockReturnValue(mockRows),
        });

        metrics.on('done', (index) => {
            expect(index).toBe(0);
            done();
        });

        metrics.calc(0, 'https://example.com');
    });

    test('should handle missing data gracefully in _busFactor()', () => {
        const packageInfo = new Map([['top3', 10]]); // Missing 'commits/yr'

        const metricsMap = new Map();
        expect(() => (metrics as any)._busFactor(packageInfo, metricsMap)).toThrow('process.exit called with code 1');
    });

    test('should handle missing data gracefully in _rampUp()', () => {
        const packageInfo = new Map(); // No 'downloads' key

        const metricsMap = new Map();
        expect(() => (metrics as any)._rampUp(packageInfo, metricsMap)).toThrow('process.exit called with code 1');
    });
});
