import * as fs from 'fs';
import { exec } from 'child_process';

exec('npx jest tests/feature tests/unit --silent --coverage --detectOpenHandles > jest-output.txt 2>&1', (error, stderr, stdout) => {
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
