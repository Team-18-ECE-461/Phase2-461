//import * as database from './database';
import Database from 'better-sqlite3';
import { RowInfo } from './calc_metrics';
import { EventEmitter  } from 'stream';
//import { fstat } from 'fs';
//import { JSONOutput } from '@aws-sdk/client-s3';

/**
 * Class representing output metrics functionality.
 * @extends EventEmitter
 */
export class OutputMetrics extends EventEmitter {
    private _db: Database.Database;
    private fileNum: number;
    private fp: number;
    private loglvl: number;

    /**
     * Create an OutputMetrics object.
     * Given a database, file number, file pointer, and log level, create an OutputMetrics object.
     */
    constructor(db: Database.Database, fileNum: number, fp: number, loglvl: number) {
        super();
        this._db = db;
        this.fileNum = fileNum;
        this.fp = fp;
        this.loglvl = loglvl;
    }

    output_Metrics(index: number, url: string): string {
        /**
         * Retrieve metrics from the database and output them to stdout.
         * Input: index - the index of the package to retrieve metrics for
         */
        let output: any;
        try {

            const rows = this._db.prepare('SELECT * FROM package_scores WHERE url = ?').all(url);
    

            // Output each row's metrics to stdout
            if (rows && rows.length > 0) {
                let row = rows[0];
                const typedRow = row as RowInfo;
                const metrics = JSON.parse(typedRow.metrics || '{}'); // Parse metrics if it's a JSON string
                const formattedMetrics = {
                    ...metrics,
                    BusFactorLatency: parseFloat(metrics.BusFactorLatency?.toFixed(3)),
                    CorrectnessLatency: parseFloat(metrics.CorrectnessLatency?.toFixed(3)),
                    RampUpLatency: parseFloat(metrics.RampUpLatency?.toFixed(3)),
                    ResponsiveMaintainerLatency: parseFloat(metrics.ResponsiveMaintainerLatency?.toFixed(3)),
                    LicenseScoreLatency: parseFloat(metrics.LicenseScoreLatency?.toFixed(3)),
                    GoodPinningPracticeLatency: parseFloat(metrics.GoodPinningPracticeLatency?.toFixed(3)),
                    PullRequestLatency: parseFloat(metrics.PullRequestLatency?.toFixed(3)),
                    NetScoreLatency: parseFloat(metrics.NetScoreLatency?.toFixed(3)),
                    BusFactor: parseFloat(metrics.BusFactor?.toFixed(3)),
                    Correctness: parseFloat(metrics.Correctness?.toFixed(3)),
                    RampUp: parseFloat(metrics.RampUp?.toFixed(3)),
                    ResponsiveMaintainer: parseFloat(metrics.ResponsiveMaintainer?.toFixed(3)),
                    GoodPinningPractice: parseFloat(metrics.GoodPinningPractice?.toFixed(3)),
                    PullRequest: parseFloat(metrics.PullRequest?.toFixed(3)),
                    NetScore: parseFloat(metrics.NetScore?.toFixed(3)),
                    
                };
                output = {
                    ...formattedMetrics
                };
                console.log(JSON.stringify(output));   
            
            } else {
                console.log('No data found in the database.');
                return JSON.stringify({ message: 'No data found in the database.' });
            }
            return JSON.stringify(output);
            this.emit('done', index);
            this.fileNum--;
            if (this.fileNum === 0) {
                this.emit('close', this._db);
            }
        } catch (err) {
            console.error('Error retrieving data from the database:', err);
            process.exit(1);
        }
    }    
}