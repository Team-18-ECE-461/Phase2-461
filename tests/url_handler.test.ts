


import { UrlHandler, RowInfo } from '../metrics/url_handler'; // Adjust the import paths accordingly
import axios from 'axios';
import Database from 'better-sqlite3';
import fs from 'fs';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import * as database from '../metrics/database'; // Import the database module

jest.mock('axios');
jest.mock('fs');
jest.mock('isomorphic-git');
jest.mock('../metrics/database');
jest.mock('better-sqlite3');

// Mock the database module with separate mocks for prepare and all
const mockPrepare = jest.fn();
const mockAll = jest.fn();
const mockDatabase = {
    prepare: mockPrepare,
};
const mockRun = jest.fn();

describe('UrlHandler', () => {
    let urlHandler: UrlHandler;
    let db: Database.Database;
    let mockFp = 1;
    let mockLogLvl = 2;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        mockPrepare.mockReturnValue({ all: mockAll });
        db = mockDatabase as unknown as Database.Database;
        urlHandler = new UrlHandler(db, mockFp, mockLogLvl);
    });

    test('main should retrieve owner/repo and fetch metrics', async () => {
        const mockRow: RowInfo = {
            id: 1,
            url: 'https://github.com/caolan/async',
            information: null,
            metrics: null,
        };

        // Mock the database to return the row data
        mockAll.mockReturnValue([mockRow]);

        const mockGetOwnerAndRepo = jest
            .spyOn(urlHandler as any, 'getOwnerAndRepo')
            .mockResolvedValue({
                owner: 'owner',
                repo: 'repo',
            });

        const mockGetRepoMetrics = jest
            .spyOn(urlHandler as any, 'getRepoMetrics')
            .mockResolvedValue(null);

        await urlHandler.main(1);

        expect(mockGetOwnerAndRepo).toHaveBeenCalledWith(
            'https://github.com/caolan/async'
        );
        expect(mockGetRepoMetrics).toHaveBeenCalledWith(
            'owner',
            'repo',
            mockRow
        );
    });

    test('getTopContributors should fetch top contributors and calculate commits', async () => {
        const mockContributors = {
            data: [
                { login: 'contributor1', contributions: 50 },
                { login: 'contributor2', contributions: 30 },
                { login: 'contributor3', contributions: 20 },
            ],
        };

        const mockCommits = {
            data: Array(10).fill({}),
        };

        (axios.get as jest.Mock).mockResolvedValueOnce(mockContributors); // For contributors API
        (axios.get as jest.Mock).mockResolvedValue(mockCommits); // For commit counts

        await urlHandler.getTopContributors('owner', 'repo');

        expect(urlHandler['commitsMap'].get('top3')).toBe(30);
    });

    test('getCommitsPastYear should calculate yearly commits', async () => {
        const mockCommits = {
            data: Array(10).fill({}),
        };

        (axios.get as jest.Mock).mockResolvedValue(mockCommits);

        await urlHandler.getCommitsPastYear('owner', 'repo');

        expect(urlHandler['commitsMap'].get('commits/yr')).toBe(10);
    });

    test('checkLicense should set license metric', async () => {
        const mockRepoData = {
            data: {
                default_branch: 'main',
            },
        };

        (axios.get as jest.Mock).mockResolvedValueOnce(mockRepoData); // GitHub API response for default branch
        (git.clone as jest.Mock).mockResolvedValue(null);
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readdirSync as jest.Mock).mockReturnValue(['LICENSE']);
        (fs.statSync as jest.Mock).mockReturnValue({
            isDirectory: () => false,
            isFile: () => true,
            size: 100,
        });

        await urlHandler['checkLicense']('owner', 'repo');

        expect(urlHandler['commitsMap'].get('License')).toBe(1);
    });

    test('getOpenedIssues should store total opened issues', async () => {
        const mockIssues = {
            data: {
                items: Array(10).fill({}),
                total_count: 10,
            },
        };

        (axios.get as jest.Mock).mockResolvedValue(mockIssues);

        await urlHandler['getOpenedIssues']('owner', 'repo');

        expect(urlHandler['commitsMap'].get('issuesOpenedYr')).toBe(10);
    });

    test('getClosedIssues should store closed issue metrics', async () => {
        const mockIssues = {
            data: {
                items: Array(10).fill({
                    created_at: new Date().toISOString(),
                    closed_at: new Date().toISOString(),
                }),
                total_count: 10,
            },
        };

        (axios.get as jest.Mock).mockResolvedValue(mockIssues);

        await urlHandler['getClosedIssues']('owner', 'repo');

        expect(urlHandler['commitsMap'].get('issuesClosedYr')).toBe(10);
    });

    test('getCodeReviewFraction should calculate fraction of reviewed code', async () => {
        const mockPullRequestsResponse = {
            data: {
                items: [
                    { number: 1 },
                    { number: 2 },
                    { number: 3 },
                ],
                total_count: 3,
            },
        };

        const mockPRDetails = [
            { data: { additions: 100 } },
            { data: { additions: 200 } },
            { data: { additions: 300 } },
        ];

        const mockReviews = [
            { data: [{ id: 1 }] }, // PR 1 has reviews
            { data: [] },          // PR 2 has no reviews
            { data: [{ id: 2 }] }, // PR 3 has reviews
        ];

        // Mock API responses for PRs, their details, and reviews
        (axios.get as jest.Mock)
            .mockResolvedValueOnce(mockPullRequestsResponse) // PRs API response
            .mockResolvedValueOnce(mockPRDetails[0])         // PR 1 details
            .mockResolvedValueOnce(mockReviews[0])           // PR 1 reviews
            .mockResolvedValueOnce(mockPRDetails[1])         // PR 2 details
            .mockResolvedValueOnce(mockReviews[1])           // PR 2 reviews
            .mockResolvedValueOnce(mockPRDetails[2])         // PR 3 details
            .mockResolvedValueOnce(mockReviews[2]);          // PR 3 reviews

        await urlHandler['getCodeReviewFraction']('owner', 'repo');

        const fraction = urlHandler['commitsMap'].get('CodeReviewFraction');
        expect(fraction).toBeCloseTo(0.6667, 4); // 400 reviewed additions out of 600 total
    });
});
