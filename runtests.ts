import * as fs from 'fs';
import { exec } from 'child_process';

exec(
    'npx jest --silent --coverage --detectOpenHandles --json --outputFile=jest-results.json --coverageReporters="json-summary"',
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



/*
import * as fs from 'fs';
import { exec } from 'child_process';

exec('npx jest tests --coverage --detectOpenHandles > jest-output.txt 2>&1', (error, stderr, stdout) => {
    // Read the Jest output from the file
    const jestOutput = fs.readFileSync('jest-output.txt', 'utf8');
    
    // Extract the line coverage percentage from the output
    const allFilesLine = jestOutput.split('\n').find(line => line.startsWith('All files'));
    let lineCoverage = 0;

    if (allFilesLine) {
        const lineCoverageMatch = allFilesLine.match(/\s+(\d+\.\d+)\s+\|\s+\d+\.\d+\s+\|\s+\d+\.\d+\s+\|\s+(\d+\.\d+)\s+\|/);
        if (lineCoverageMatch && lineCoverageMatch[2]) {
            lineCoverage = parseFloat(lineCoverageMatch[2]);
        }
    }

    // Extract total tests and passed tests from the Jest output
    const testsLine = jestOutput.split('\n').find(line => line.startsWith('Tests:'));
    let totalTests = 0;
    let passedTests = 0;
    if (testsLine) {
        const testsMatch = testsLine.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
        if (testsMatch) {
            passedTests = parseInt(testsMatch[1], 10);
            totalTests = parseInt(testsMatch[2], 10);
        }
    }

    // Output the results in the format: "X/Y test cases passed. Z% line coverage achieved."
    console.log(`Total: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Coverage: ${lineCoverage.toFixed(0)}%`);
    console.log(`${passedTests}/${totalTests} test cases passed. ${lineCoverage.toFixed(0)}% line coverage achieved.`);
});

*/


/*

import * as fs from 'fs';
import { exec } from 'child_process';

exec('npx jest tests --coverage --detectOpenHandles > jest-output.txt 2>&1', (error, stderr, stdout) => {
    if (error) {
        console.error(`Error running Jest: ${error.message}`);
        return;
    }

    // Read the Jest output from the file
    const jestOutput = fs.readFileSync('jest-output.txt', 'utf8');

    // Ensure the output file is not empty
    if (!jestOutput) {
        console.error('No output captured from Jest. Check if tests are being executed.');
        return;
    }

    // Extract the line coverage percentage from the output
    const coverageMatch = jestOutput.match(/All files\s+\|\s+\d+\.\d+\s+\|\s+\d+\.\d+\s+\|\s+(\d+\.\d+)%/);
    const lineCoverage = coverageMatch ? parseFloat(coverageMatch[1]) : 0;

    // Extract total tests and passed tests from the Jest output
    const testsMatch = jestOutput.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    const passedTests = testsMatch ? parseInt(testsMatch[1], 10) : 0;
    const totalTests = testsMatch ? parseInt(testsMatch[2], 10) : 0;

    // Output the results
    console.log(`Total: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Coverage: ${lineCoverage.toFixed(0)}%`);
    console.log(`${passedTests}/${totalTests} test cases passed. ${lineCoverage.toFixed(0)}% line coverage achieved.`);
});
*/





