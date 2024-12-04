
import * as fs from 'fs';
import { exec } from 'child_process';

exec(
    'npx jest tests --coverage --detectOpenHandles --json --outputFile=jest-results.json --coverageReporters="json-summary"',
    (error, stdout, stderr) => {
        try {
            // Read and parse Jest results
            const jestResults = JSON.parse(fs.readFileSync('jest-results.json', 'utf8'));
            const totalTests = jestResults.numTotalTests || 0;
            const passedTests = jestResults.numPassedTests || 0;

            // Read and parse coverage summary
            const coverageSummaryPath = 'coverage/coverage-summary.json';
            let lineCoverage = 0;

            if (fs.existsSync(coverageSummaryPath)) {
                const coverageSummary = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
                lineCoverage = coverageSummary.total.lines.pct || 0;
            } else {
                console.warn('Coverage summary file not found. Defaulting line coverage to 0%.');
            }

            // Output results
            console.log(`Total: ${totalTests}`);
            console.log(`Passed: ${passedTests}`);
            console.log(`Coverage: ${lineCoverage.toFixed(0)}%`);
            console.log(`${passedTests}/${totalTests} test cases passed. ${lineCoverage.toFixed(0)}% line coverage achieved.`);

            // Exit with Jest's original exit code
            process.exit(error ? 1 : 0);
        } catch (parseError) {
            console.error('Error parsing Jest or coverage output:', parseError);
            process.exit(1);
        }
    }
);
