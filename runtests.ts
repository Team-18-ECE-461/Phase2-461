import * as fs from 'fs';
import { exec } from 'child_process';

/**
 * Executes Jest tests with specific options for coverage and JSON output.
 * The results and coverage summary are processed and logged to the console.
 */
exec(
    'npx jest --silent --coverage --detectOpenHandles --json --outputFile=jest-results.json --coverageReporters="json-summary"',
    (error, stdout, stderr) => {
        try {
            // Read and parse Jest results from the output file
            const jestResults = JSON.parse(fs.readFileSync('jest-results.json', 'utf8'));
            const totalTests = jestResults.numTotalTests || 0; // Total number of tests run
            const passedTests = jestResults.numPassedTests || 0; // Number of tests that passed

            // Path to the Jest coverage summary file
            const coverageSummaryPath = 'coverage/coverage-summary.json';
            let lineCoverage = 0; // Default line coverage percentage

            // Check if the coverage summary file exists
            if (fs.existsSync(coverageSummaryPath)) {
                // Read and parse the coverage summary
                const coverageSummary = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
                lineCoverage = coverageSummary.total.lines.pct || 0; // Line coverage percentage
            } else {
                // Log a warning if the coverage summary file is not found
                console.warn('Coverage summary file not found. Defaulting line coverage to 0%.');
            }

            // Log test results and coverage to the console
            console.log(`Total: ${totalTests}`); // Total tests run
            console.log(`Passed: ${passedTests}`); // Number of tests passed
            console.log(`Coverage: ${lineCoverage.toFixed(0)}%`); // Line coverage percentage
            console.log(`${passedTests}/${totalTests} test cases passed. ${lineCoverage.toFixed(0)}% line coverage achieved.`);

            // Exit with Jest's original exit code (error if tests failed, 0 if all passed)
            process.exit(error ? 1 : 0);
        } catch (parseError) {
            // Log and exit with an error code if any parsing fails
            console.error('Error parsing Jest or coverage output:', parseError);
            process.exit(1);
        }
    }
);
