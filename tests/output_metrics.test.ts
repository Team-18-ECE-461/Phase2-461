import Database from 'better-sqlite3';
import { OutputMetrics } from '../metrics/output_metrics';

jest.mock('better-sqlite3', () => {
    return jest.fn().mockImplementation(() => {
        return {
            prepare: jest.fn().mockReturnValue({
                all: jest.fn(),
            }),
        };
    });
});

describe('OutputMetrics', () => {
    let db: Database.Database;
    let outputMetrics: OutputMetrics;

    beforeEach(() => {
        db = new Database(':memory:');
        outputMetrics = new OutputMetrics(db, 1, 0, 0);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should output metrics correctly when data is found', () => {
        const mockRows = [
            {
                url: 'http://example.com',
                metrics: JSON.stringify({
                    BusFactor: 0.12345,
                    BusFactorLatency: 1.23456,
                    Correctness: 0.23456,
                    CorrectnessLatency: 2.34567,
                    RampUp: 0.34567,
                    RampUpLatency: 3.45678,
                    ResponsiveMaintainer: 0.45678,
                    ResponsiveMaintainerLatency: 4.56789,
                    LicenseScore: 0.56789,
                    LicenseScoreLatency: 5.67890,
                    GoodPinningPractice: 0.67890,
                    GoodPinningPracticeLatency: 6.78901,
                    PullRequest: 0.78901,
                    PullRequestLatency: 7.89012,
                    NetScore: 0.89012,
                    NetScoreLatency: 8.90123,
                }),
            },
        ];

        (db.prepare as jest.Mock).mockReturnValue({
            all: jest.fn().mockReturnValue(mockRows),
        });

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const result = outputMetrics.output_Metrics(1, 'http://example.com');

        expect(consoleSpy).toHaveBeenCalledWith(
            JSON.stringify({
                BusFactor: 0.123,
                BusFactorLatency: 1.235,
                Correctness: 0.235,
                CorrectnessLatency: 2.346,
                RampUp: 0.346,
                RampUpLatency: 3.457,
                ResponsiveMaintainer: 0.457,
                ResponsiveMaintainerLatency: 4.568,
                LicenseScore: 0.568,
                LicenseScoreLatency: 5.679,
                GoodPinningPractice: 0.679,
                GoodPinningPracticeLatency: 6.789,
                PullRequest: 0.789,
                PullRequestLatency: 7.89,
                NetScore: 0.89,
                NetScoreLatency: 8.901,
            })
        );

        expect(result).toBe(
            JSON.stringify({
                BusFactor: 0.123,
                BusFactorLatency: 1.235,
                Correctness: 0.235,
                CorrectnessLatency: 2.346,
                RampUp: 0.346,
                RampUpLatency: 3.457,
                ResponsiveMaintainer: 0.457,
                ResponsiveMaintainerLatency: 4.568,
                LicenseScore: 0.56789,
                LicenseScoreLatency: 5.679,
                GoodPinningPractice: 0.679,
                GoodPinningPracticeLatency: 6.789,
                PullRequest: 0.789,
                PullRequestLatency: 7.89,
                NetScore: 0.89,
                NetScoreLatency: 8.901,
            })
        );

        consoleSpy.mockRestore();
    });

    it('should log "No data found in the database." when no data is found', () => {
        (db.prepare as jest.Mock).mockReturnValue({
            all: jest.fn().mockReturnValue([]),
        });

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        const result = outputMetrics.output_Metrics(1, 'http://example.com');

        expect(consoleSpy).toHaveBeenCalledWith('No data found in the database.');
        expect(result).toBe(JSON.stringify({ message: 'No data found in the database.' }));

        consoleSpy.mockRestore();
    });

    it('should handle errors and exit the process', () => {
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
            throw new Error(`process.exit: ${code}`);
        });

        (db.prepare as jest.Mock).mockReturnValue({
            all: jest.fn().mockImplementation(() => {
                throw new Error('Database error');
            }),
        });

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        expect(() => outputMetrics.output_Metrics(1, 'http://example.com')).toThrow('process.exit: 1');
        expect(consoleSpy).toHaveBeenCalledWith('Error retrieving data from the database:', expect.any(Error));

        consoleSpy.mockRestore();
        mockExit.mockRestore();
    });
});
