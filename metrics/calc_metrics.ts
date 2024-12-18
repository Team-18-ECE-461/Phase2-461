import { EventEmitter } from 'stream';
import * as database from './database';
import Database from 'better-sqlite3';
import now from 'performance-now';
import fs from 'fs';

export interface RowInfo {
    /**
     * Interface for the rows fetched from the database.
     * Only used to parse the data from the database and put it into correct data structures
     * for the Metrics class to then calculate metrics.
     */
    id: number,
    url: string,
    information: string | null, 
    metrics: string | null
}

export class Metrics extends EventEmitter {
    private _db: Database.Database;
    //private _info: Map<string, Map<string, number>>; // URL -> Information

    //changed for dependencyMetrics.ts
    private _info: Map<string, Map<string, any>>; // URL -> Information

    done: boolean = false;
    private fp: number;
    private loglvl: number;

    constructor(db: Database.Database, fp: number, loglvl: number) {
        /**
         * Creates a Metrics class instance and opens a database connection. 
         */
        super();
        this._db = db;
        this._info = new Map<string, Map<string, number>>();
        this.fp = fp;
        this.loglvl = loglvl;
    }

    private _calc_callback(row: RowInfo): void {
        /**
         * Callback method to process the row data fetched from the database.
         * Map URLs to their respective information in order to calculate metrics later. 
         * Fetches all information in the database at once.
         * If there was an error retreiving the data, log the error and set information for URL as -1.
         * 
         * Inputs:
         * - err: Error | null - error object if there was an error fetching the data
         * - row: RowInfo - row fetched from the database
         * 
         * Outputs:
         * - None
         */
        try { // catch JSON.parse errors
            if (row.information) {
                // if rowInformation is NULL, don't interact

                //const parsedInfo = new Map<string, number>(Object.entries(JSON.parse(row.information))); // Parse the information from the JSON string
                const parsedInfo = new Map<string, any>(Object.entries(JSON.parse(row.information))); // Parse the information from the JSON string

                this._info.set(row.url,parsedInfo); // Add the information to the map
            }
        } catch(e) {
            console.error(`Error parsing information for ${row.url}: ${e}`);
            process.exit(1);
        }
    }

    private _busFactor(packInfo: Map<string, number>, metrics: Map<string, number>): number {
        /**
         * Calculates the bus factor for one package then populates the metrics map
         * 1 - (commits by top 3 contributors / total commits in the last year)
         * 
         * Inputs:
         * - packInfo: Map<string, number> - information about specific package
         * - metrics: Map<string, number> - metrics map to populate with bus factor
         * 
         * Outputs:
         * - None
         */
        const top3 = packInfo.get('top3');
        const commits = packInfo.get('commits/yr');
        console.log(top3,commits)
        if (commits != undefined && top3 != undefined) {
            if (commits == 0) { // if there are no commits in the past year, bus factor is 0?
                metrics.set('BusFactor', 0); 
                return 0;
            }
            let busFactor = 1 - (top3 / commits);
            if(busFactor < 0) {
                busFactor = 0;}
            metrics.set('BusFactor', busFactor);
            return busFactor;
        } else {
            console.error('Error calculating bus factor: total commits or commits by top 3 contributors not found');
            process.exit(1);
        }
    }

    private _correctness(packInfo: Map<string, number>, metrics: Map<string, number>) : number {
        /**
         * Calculates the correctness for one package then populates the metrics map
         * Number of issues resolved / total number of issues
         * 
         * Inputs: 
         * - packInfo: Map<string, number> - information about specific package
         * - metrics: Map<string, number> - metrics map to populate with correctness
         * 
         * Outputs:
         * - None
         */
        const resolved = packInfo.get('issuesClosedYr');
        const issues = packInfo.get('issuesOpenedYr');
        if (resolved != undefined && issues != undefined) {
            if (issues == 0) { 
                metrics.set('Correctness', 1); // if there are no issues, correctness is 1?
                return 1;
            }
            const correctness = Math.min(resolved / issues, 1);
            metrics.set('Correctness', correctness);
            return correctness;
        } else {
            console.error('Error calculating correctness: resolved issues or total issues not found');
            process.exit(1);
        }
    }

    private _rampUp(packInfo: Map<string, number>, metrics: Map<string, number>): number {
        /**
         * Calculates the ramp up for one package then populates the metrics map
         * 1.0: 1.2M+ downloads
         * 0.9: 500k-1.2M downloads
         * 0.6: 50k-500k downloads
         * 0.3: 1k-50k downloads
         * 0: < 1k downloads
         * 
         * Inputs:
         * - packInfo: Map<string, number> - information about specific package
         * - metrics: Map<string, number> - metrics map to populate with ramp up
         * 
         * Outputs:
         * - None
         */
        const downloads = packInfo.get('downloads');
        if (downloads != undefined) {
            let val = 1;
            if (downloads < 1000) val = 0;
            else if (downloads < 50000) val = 0.3;
            else if (downloads < 500000) val = 0.6;
            else if (downloads < 1200000) val = 0.9;
            metrics.set('RampUp', val);
            return val;
        } else {
            console.error('Error calculating ramp up: number of downloads not found');
            process.exit(1);
        }
    }

    private _responsiveness(packInfo: Map<string, number>, metrics: Map<string, number>): number {
        /**
         * Calculates the responsiveness for one package then populates the metrics map
         * Sum of issues weights divided by total issues in the last year
         * Weights:
         * - 1: issue closed within 3 days
         * - 0.7 issue closed within 3-7 days
         * - 0.4 issue closed within 7-14 days
         * - 0.1 issue closed within 14-31 days
         * - 0.0 else
         * 
         * Inputs:
         * - packInfo: Map<string, number> - information about specific package
         * - metrics: Map<string, number> - metrics map to populate with responsiveness
         * 
         * Outputs:
         * - None
         */
        const iss3 = packInfo.get('iss3');
        const iss7 = packInfo.get('iss7');
        const iss14 = packInfo.get('iss14');
        const iss31 = packInfo.get('iss31');
        const issues = packInfo.get('issuesOpenedYr');
        const issuesClosed = packInfo.get('issuesClosedYr');
        if (iss3 != undefined && iss7 != undefined && iss14 != undefined && iss31 != undefined && issuesClosed != undefined) {
            if (issuesClosed == 0){
                metrics.set('ResponsiveMaintainer', 0);
                return 0;
            }
        const totalWeighted = iss3 + iss7 * 0.7 + iss14 * 0.4 + iss31 * 0.1;
        const responsiveness = issuesClosed > 0 ? Math.min(totalWeighted / issuesClosed, 1) : 0;
        metrics.set('ResponsiveMaintainer', responsiveness);
        return responsiveness;
        } 
        else {
            console.error('Error calculating responsiveness: resolved issues or total issues not found');
            process.exit(1);
        }
    }

    //for dependencyMetrics.ts
    private _dependencyPinning(packInfo: Map<string, any>, metrics: Map<string, number>): number {
        const packageJsonContent = packInfo.get('packageJson');
        if (!packageJsonContent) {
            console.error('Error calculating dependency pinning: packageJson not found');
            process.exit(1);
        }
        let packageJson: any;
        try {
            packageJson = JSON.parse(packageJsonContent);
        } catch (error) {
            console.error('Error parsing packageJson content:', error);
            process.exit(1);
        }
        const dependencies = packageJson.dependencies || {};
        const totalDependencies = Object.keys(dependencies).length;
        if (totalDependencies === 0) {
            metrics.set('GoodPinningPractice', 1.0);
            return 1.0;
        }
        let pinnedCount = 0;
        for (const depVersion of Object.values(dependencies)) {
            if (typeof depVersion !== 'string') continue;
            const match = depVersion.match(/^[\^~]?(\d+)\.(\d+)/);
            if (match) {
                pinnedCount++;
            }
        }
        const score = pinnedCount / totalDependencies;
        metrics.set('GoodPinningPractice', score);
        return score;
    }

    private _codeReviewFraction(packInfo: Map<string, any>, metrics: Map<string, number>): number {
        const fraction = packInfo.get('CodeReviewFraction');
        if (fraction !== undefined) {
          metrics.set('PullRequest', fraction);
          return fraction;
        } else {
          console.error('Error calculating code review fraction: data not found');
          metrics.set('CodeReview', 0);
          return 0;
        }
      }
      


    private _netScore (bus: number, correct: number, ramp: number, response: number, license: number, depPin: number, code_review_fraction: number): number {
        /**
         * Calculates the net score for one package
         * (Sum of weight x metric score) x license factor
         * Weigthts:
         * - 0.4 : responsiveness
         * - 0.3 : correctness
         * - 0.1: bus factor
         * - 0.2: ramp up 
         * 
         * Inputs:
         * - bus: number - bus factor for the package
         * - correct: number - correctness for the package
         * - ramp: number - ramp up for the package
         * - response: number - responsiveness for the package
         * - license: number - license factor for the package
         * 
         * Outputs:
         * - number - net score for the package
         */

        //adding dependencyMetrics (depPin) into this equation:

        return (0.1 * bus + 0.2 * correct + 0.1 * ramp + 0.3 * response + 0.1 * depPin + 0.2 * code_review_fraction) * license;
    }

    private _calculateMetrics(): void {
        /**
         * Calculates the metrics for each package sequentially, then stores the results in the database.
         **/ 
        this._info.forEach((value, key) => {
            if (value) {
                const metrics = new Map<string, number>();
                const start_net = now();

                // Bus Factor
                const start_bus = now();
                const bus = this._busFactor(value, metrics);
                const end_bus = now();
                metrics.set('BusFactorLatency', end_bus - start_bus);
    
                // Correctness
                const start_correct = now();
                const correct = this._correctness(value, metrics);
                const end_correct = now();
                metrics.set('CorrectnessLatency', end_correct - start_correct);
    
                // Ramp Up
                const start_ramp = now();
                const ramp = this._rampUp(value, metrics);
                const end_ramp = now();
                metrics.set('RampUpLatency', end_ramp - start_ramp);
    
                // Responsive Maintainer
                const start_response = now();
                const response = this._responsiveness(value, metrics);
                const end_response = now();
                metrics.set('ResponsiveMaintainerLatency', end_response - start_response);
    
                // License
                const start_license = now();
                const license = value.get('License');
                metrics.set('LicenseScore', license ? license : 0);
                const end_license = now();
                metrics.set('LicenseScoreLatency', end_license - start_license);
    
                // Dependency Pinning
                const start_dep_pinning = now();
                const dep_pinning = this._dependencyPinning(value, metrics);
                const end_dep_pinning = now();
                metrics.set('GoodPinningPracticeLatency', end_dep_pinning - start_dep_pinning);
    
                // Code Review Fraction
                const start_code_review = now();
                const code_review_fraction = this._codeReviewFraction(value, metrics);
                const end_code_review = now();
                metrics.set('PullRequestLatency', end_code_review - start_code_review);
    
                // Net Score
                //const start_net = now();
                const net = this._netScore(
                    bus,
                    correct,
                    ramp,
                    response,
                    license ? license : 0,
                    dep_pinning,
                    code_review_fraction
                );
                metrics.set('NetScore', net);
                const end_net = now();
                metrics.set('NetScoreLatency', end_net - start_net);
    
                // Update the database
                database.updateEntry(
                    this._db,
                    key,
                    this.fp,
                    this.loglvl,
                    undefined,
                    JSON.stringify(Object.fromEntries(metrics))
                );
    
            } else {
                console.error(`Error calculating metrics for ${key}: information not found`);
                process.exit(1);
            }
        });
        this.done = true;
    }
    

    public calc(index: number, url:string): void {
        /**
         * Wrapper function to calculate the metrics for all packages.
         * 
         * Inputs:
         * - None
         * 
         * Outputs:
         * - None
         */
        // this._db.prepare
        const rows = this._db.prepare(`SELECT * FROM package_scores WHERE url = ?`).all(url);
        // const x = rows.all();
        
        rows.forEach((row: unknown) => {
            if (this.loglvl == 2) fs.writeFileSync(this.fp, JSON.stringify(row));
            this._calc_callback(row as RowInfo);
        });
        // await this._db.each<RowInfo>(`SELECT * FROM package_scores`, this._calc_callback.bind(this));
        this._calculateMetrics(); // calculate the metrics
        this.emit('done', index);

    }
}