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

    output_Metrics(index: number): string {
        /**
         * Retrieve metrics from the database and output them to stdout.
         * Input: index - the index of the package to retrieve metrics for
         */
        let output: any;
        try {
            const rows = this._db.prepare('SELECT * FROM package_scores WHERE id = ?').all(index);
            //change
            // Output each row's metrics to stdout
            if (rows && rows.length > 0) {
                let row = rows[0];
                const typedRow = row as RowInfo;
                const metrics = JSON.parse(typedRow.metrics || '{}'); // Parse metrics if it's a JSON string
                // {
                //     "BusFactor": 0.1,
                //     "BusFactorLatency": 0.1,
                //     "Correctness": 0.1,
                //     "CorrectnessLatency": 0.1,
                //     "RampUp": 0.1,
                //     "RampUpLatency": 0.1,
                //     "ResponsiveMaintainer": 0.1,
                //     "ResponsiveMaintainerLatency": 0.1,
                //     "LicenseScore": 0.1,
                //     "LicenseScoreLatency": 0.1,
                //     "GoodPinningPractice": 0.1,
                //     "GoodPinningPracticeLatency": 0.1,
                //     "PullRequest": 0.1,
                //     "PullRequestLatency": 0.1,
                //     "NetScore": 0.1,
                //     "NetScoreLatency": 0.1
                //   }
                // Format latency values to three decimal places
                const formattedMetrics = {
                    ...metrics,
                    BusFactorLatency: parseFloat(metrics.BusFactor_Latency?.toFixed(3)),
                    CorrectnessLatency: parseFloat(metrics.Correctness_Latency?.toFixed(3)),
                    RampUpLatency: parseFloat(metrics.RampUp_Latency?.toFixed(3)),
                    ResponsiveMaintainerLatency: parseFloat(metrics.ResponsiveMaintainer_Latency?.toFixed(3)),
                    LicenseLatency: parseFloat(metrics.License_Latency?.toFixed(3)),
                    GoodPinningPracticeLatency: parseFloat(metrics.GoodPinningPractice_Latency?.toFixed(3)),
                    PullRequestLatency: parseFloat(metrics.PullRequest_Latency?.toFixed(3)),
                    NetScoreLatency: parseFloat(metrics.NetScore_Latency?.toFixed(3)),
                    BusFactor: parseFloat(metrics.BusFactor?.toFixed(3)),
                    Correctness: parseFloat(metrics.Correctness?.toFixed(3)),
                    RampUp: parseFloat(metrics.RampUp?.toFixed(3)),
                    ResponsiveMaintainer: parseFloat(metrics.ResponsiveMaintainer?.toFixed(3)),
                    GoodPinningPractice: parseFloat(metrics.GoodPinningPractice?.toFixed(3)),
                    PullRequest: parseFloat(metrics.PullRequest?.toFixed(3)),
                    NetScore: parseFloat(metrics.NetScore?.toFixed(3)),
                    
                };
                output = {
                    URL: typedRow.url,
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