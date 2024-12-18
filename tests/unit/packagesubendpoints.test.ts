/**
 * Unit tests for helper functions and sub-endpoints in the `packagesubendpoints` Lambda module.
 *
 * This test suite validates the functionality of utility and core functions used for managing packages,
 * including operations such as uploading, downloading, extracting, and validating packages. It also
 * covers interactions with AWS services like S3 and DynamoDB, as well as utility libraries like JSZip and Archiver.
 *
 * Features tested:
 * - Package management operations, including version validation, package ID generation, and metadata handling.
 * - Integration with S3 and DynamoDB for storage and metadata persistence.
 * - Download and extraction of packages from sources like GitHub and NPM.
 * - Utility operations such as extracting base64 content, cleaning up temporary files, and parsing URLs.
 *
 * Mocking:
 * - AWS SDK clients (S3 and DynamoDB) are mocked to simulate cloud interactions.
 * - File system and library dependencies (e.g., JSZip, Archiver, Axios) are mocked to simulate file operations and HTTP requests.
 *
 * Test scenarios:
 * 1. Validation of existing and most recent package versions.
 * 2. Downloading and extracting packages from GitHub and NPM.
 * 3. Base64 content extraction and file cleanup.
 * 4. Version conversion and ID generation.
 * 5. Successful uploads and interactions with DynamoDB.
 *
 * Note:
 * Certain tests are commented out for incomplete implementation or further verification.
 * Uncomment and adapt them as required when the corresponding functionality is finalized.
 */








import { S3, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { arch, tmpdir } from 'os';
import * as crypto from 'crypto';
import * as tar from 'tar';
import unzipper from 'unzipper';
import archiver from 'archiver';
import { PassThrough } from 'stream';


import { lambdaHandler, handleGetPackage, handleUpdatePackage, handleDeletePackage, downloadAndExtractGithubPackage, checkexistingPackage, getMostRecentVersion, checkValidVersionContent, parseGitHubUrl, urlhandler, getEntryPoint, uploadDB, versionInt, downloadAndExtractNpmPackage, generatePackageId, cleanupTempFiles, extractBase64ZipContent, zipFolder, uploadToS3, checkValidVersion, downloadNpm } from '../../lambda/packagesubendpoints';
import { config } from 'dotenv';

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    promises: {
      ...jest.requireActual('fs').promises,
      mkdtemp: jest.fn(),
      writeFile: jest.fn(),
      readFile: jest.fn(),
      readdir: jest.fn(),
      stat: jest.fn(),
      unlink: jest.fn(),
      rm: jest.fn(),
    },
    createWriteStream: jest.fn(),
    createReadStream: jest.fn(),
  }));
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('axios');
jest.mock('fs');
jest.mock('path');
jest.mock('os');
jest.mock('crypto');
jest.mock('tar');
jest.mock('unzipper');
jest.mock('archiver')

describe('Helper Functions', () => {
    const s3 = new S3();
    const dynamoDBclient = new DynamoDBClient({}) as jest.Mocked<DynamoDBClient>;
    (dynamoDBclient.send as jest.Mock).mockResolvedValueOnce({ Items: [{ Version: { S: '1.0.0' } }] });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // describe('downloadAndExtractGithubPackage', () => {
    //     it('should download and extract a GitHub package', async () => {
    //         const githubUrl = 'https://github.com/owner/repo';
    //         const destination = '/tmp/package';
    //         const owner = 'owner';
    //         const repo = 'repo';

    //         const tarballUrl = `https://api.github.com/repos/owner/repo/tarball`;
    //         jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: { archive_url: tarballUrl } });
  
    //         // Mock tarball download
    //         const mockReadable = new PassThrough();
    //         jest.spyOn(axios, 'get').mockResolvedValueOnce({
    //             data: mockReadable,
    //         });
    //         // Push some mock data to the readable stream
           
        
    //         setTimeout(() => {
    //           mockReadable.push('mock tarball content'); // Simulate tarball content
    //           mockReadable.push(null); // End the stream
    //         }, 0);

    //             jest.spyOn(fs, 'createWriteStream').mockReturnValueOnce({
    //             on: jest.fn().mockImplementation(function (this: fs.WriteStream, event, callback) {
    //                 if (event === 'finish') callback();
    //                 return this;
    //             }),
    //             once: jest.fn(),
    //             end: jest.fn(),
    //             write: jest.fn(),
    //             close: jest.fn(),
    //             emit: jest.fn(),
    //         } as unknown as fs.WriteStream);
    //         // jest.spyOn(fs, 'createWriteStream').mockReturnValueOnce({ on: jest.fn((event, callback) => callback()) } as any);
    //         jest.spyOn(fs.promises, 'readdir').mockResolvedValueOnce([{ name: 'folder', isDirectory: () => true } as fs.Dirent]);
    //         jest.spyOn(fs, 'statSync').mockReturnValueOnce({ isDirectory: () => true } as any);
    //         jest.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
    //         jest.spyOn(fs.promises, 'readFile').mockResolvedValueOnce(JSON.stringify({ version: '1.0.0' }));

    //         const result = await downloadAndExtractGithubPackage(githubUrl, destination, owner, repo, 'main');

    //         expect(result).toEqual([path.join(destination, 'folder'), '1.0.0']);
    //     });
    // });

    describe('checkexistingPackage', () => {
        it('should check if a package exists', async () => {
            const packageName = 'test-package';
            const packageVersion = '1.0.0';

            (dynamoDBclient.send as jest.Mock).mockResolvedValueOnce({ Items: [{ Version: { S: packageVersion } }] });

            const result = await checkexistingPackage(packageName, packageVersion);

            expect(result).toBe(true);
        });
    });

    describe('getMostRecentVersion', () => {
        it('should get the most recent version of a package', async () => {
            const packageName = 'test-package';

         (dynamoDBclient.send as jest.Mock).mockResolvedValueOnce({ Items: [{ Version: { S: '1.0.0' } }] } as any);

            const result = await getMostRecentVersion(packageName, 1, 0);

            expect(result).toBe(1000000);
        });
    });

    describe('checkValidVersionContent', () => {
        it('should check if a version is valid', async () => {
            const version = '1.0.1';
            const mostRecentVersion = 1000000;

            const result = await checkValidVersionContent(version, mostRecentVersion);

            expect(result).toBe(true);
        });
    });

    describe('parseGitHubUrl', () => {
        it('should parse a GitHub URL', () => {
            const url = 'https://github.com/parvk11/362_project';

            const result = parseGitHubUrl(url);

            expect(result).toEqual(['parvk11', '362_project']);
        });
    });

    describe('urlhandler', () => {
        it('should handle a GitHub URL', async () => {
            const url = 'https://github.com/owner/repo';

            const result = await urlhandler(url);

            expect(result).toBe(url);
        });
    });

    // describe('getEntryPoint', () => {
    //     it('should get the entry point of a package', () => {
    //         const packageJsonPath = '/path/to/package.json';

    //         jest.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
    //         (fs.promises.readFile as jest.Mock).mockResolvedValueOnce(JSON.stringify({ main: 'index.js' }));

    //         const result = getEntryPoint(packageJsonPath);

    //         expect(result).toEqual(['index.js']);
    //     });
    // });

    describe('uploadDB', () => {
        it('should upload data to DynamoDB', async () => {
            const packageId = 'test-id';
            const packageName = 'test-package';
            const packageVersion = '1.0.0';
            const JSProgram = 'test-program';
            const url = 'https://github.com/owner/repo';

            await uploadDB(packageId, packageName, packageVersion, JSProgram, url);

            expect(dynamoDBclient.send).toHaveBeenCalledWith(expect.any(PutItemCommand));
        });
    });

    describe('versionInt', () => {
        it('should convert a version string to an integer', () => {
            const version = '1.0.0';

            const result = versionInt(version);

            expect(result).toBe(1000000);
        });
    });

    describe('downloadAndExtractNpmPackage', () => {
        it('should download and extract an npm package', async () => {
            const npmUrl = 'https://www.npmjs.com/package/test-package';
            const destination = '/tmp/package';
            const packageName = 'test-package';
            const packageVersion = '1.0.0';

            jest.spyOn(axios,'get').mockResolvedValueOnce({ data: { dist: { tarball: 'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz' } } });
            const mockReadable = new PassThrough();

            jest.spyOn(axios, 'get').mockResolvedValueOnce({
                data: mockReadable,
            });

            jest.spyOn(fs, 'createWriteStream').mockReturnValueOnce({
                on: jest.fn().mockImplementation(function (this: fs.WriteStream, event, callback) {
                    if (event === 'finish') callback();
                    return this;
                }),
                once: jest.fn(),
                end: jest.fn(),
                write: jest.fn(),
                close: jest.fn(),
                emit: jest.fn(),
            } as unknown as fs.WriteStream);
            jest.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/npm-');
            jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);

            const result = await downloadAndExtractNpmPackage(npmUrl, destination, packageName, packageVersion);

            expect(result).toEqual([path.join(destination, 'package'), packageVersion, packageName]);
        });
    });
    const mockedCrypto = crypto as jest.Mocked<typeof crypto>;


    describe('generatePackageId', () => {
        it('should generate a package ID', () => {
             mockedCrypto.createHash.mockReturnValue({
              update: jest.fn().mockReturnThis(),
              digest: jest.fn().mockReturnValue(Buffer.from('1234567890abcdef', 'hex')),
            } as any);
        
            const result = generatePackageId('example-package', '1.0.0');
            expect(result).toStrictEqual(Buffer.from('1234567890abcdef', 'hex'));
          });
    });

    describe('cleanupTempFiles', () => {
        it('should clean up temporary files', async () => {
            const tempFilePath = '/tmp/package';

            jest.spyOn(fs.promises, 'access').mockResolvedValueOnce();
            (fs.promises.stat as jest.Mock).mockResolvedValueOnce({ isFile: () => true });
            (fs.promises.unlink as jest.Mock).mockResolvedValueOnce({});

            await cleanupTempFiles(tempFilePath);

            expect(fs.promises.unlink).toHaveBeenCalledWith(tempFilePath);
        });
    });

    describe('extractBase64ZipContent', () => {
        it('should extract base64 zip content', async () => {
            const base64Content = 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==';
            const destination = '/tmp/package';

            jest.spyOn(fs.promises, 'writeFile').mockResolvedValueOnce(undefined);
            jest.spyOn(fs,'createReadStream').mockReturnValueOnce({ pipe: jest.fn().mockReturnValueOnce({ promise: jest.fn().mockResolvedValueOnce('') }), close: jest.fn(), bytesRead: 0, path: '', pending: false } as any);
            jest.spyOn(fs.promises, 'readdir').mockResolvedValueOnce([
                { name: 'folder1', isDirectory: () => true } as fs.Dirent,
                { name: 'file1.txt', isDirectory: () => false } as fs.Dirent
            ]);
            jest.spyOn(fs, 'statSync').mockReturnValueOnce({ isDirectory: () => true } as any);
            const result = await extractBase64ZipContent(base64Content, destination);

            expect(result).toBe(path.join(destination, 'package'));
        });
    });


    
    // describe('zipFolder', () => {
    //     it('should zip a folder', async () => {
    //         const source = '/path/to/source';
    //         const out = '/path/to/out.zip';

    //         jest.spyOn(fs,'createWriteStream').mockReturnValueOnce({ on: jest.fn((event, callback) => callback()) });
    //         //archiver.mockReturnValueOnce({ pipe: jest.fn(), directory: jest.fn(), finalize: jest.fn().mockResolvedValueOnce() });

    //         await zipFolder(source, out);

    //         expect(archiver).toHaveBeenCalledWith('zip', { zlib: { level: 9 } });
    //     });
    // });

    // describe('uploadToS3', () => {
    //     it('should upload a file to S3', async () => {
    //         const filePath = '/path/to/file.zip';
    //         const bucketName = 'test-bucket';
    //         const key = 'test-key';

    //         jest.spyOn(fs, 'createReadStream').mockReturnValueOnce({} as any);

    //         await uploadToS3(filePath, bucketName, key);

    //         expect(s3.putObject).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    //     });
    // });

    describe('checkValidVersion', () => {
        it('should check if a version is valid', async () => {
            const packageName = 'test-package';
            const version = '1.0.0';

            (dynamoDBclient.send as jest.Mock).mockResolvedValueOnce({ Items: [{ Version: { S: '1.0.0' } }] } as any)

            const result = await checkValidVersion(packageName, version);

            expect(result).toBe(false);
        });
    });

    jest.mock('archiver', () => {
        return jest.fn().mockImplementation(() => {
            return {
                pipe: jest.fn(),
                directory: jest.fn(),
                finalize: jest.fn(),
            };
        });
    });
    

    /*describe('downloadNpm', () => {
        it('should download an npm package', async () => {
            const npmUrl = 'https://www.npmjs.com/package/test-package';

            jest.spyOn(axios,'get').mockResolvedValueOnce({ data: { name: 'test-package', 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': { dist: { tarball: 'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz' } } } } });
            
            const mockReadable = new PassThrough();

            jest.spyOn(axios, 'get').mockResolvedValueOnce({
                data: mockReadable,
            });
    
            // Push some mock data to the readable stream
            setTimeout(() => {
                mockReadable.push('mock tarball content');
                mockReadable.push(null); // End the stream
            }, 0);

            jest.spyOn(fs, 'createWriteStream').mockReturnValueOnce({
                on: jest.fn().mockImplementation(function (this: fs.WriteStream, event, callback) {
                    if (event === 'finish') callback();
                    return this;
                }),
                once: jest.fn(),
                end: jest.fn(),
                write: jest.fn(),
                close: jest.fn(),
                emit: jest.fn(),
            } as unknown as fs.WriteStream);
            jest.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/npm-');
            jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);

            // Spy on archiver methods
            const archiver = require('archiver');
            const archive = archiver('zip', { zlib: { level: 9 } });
            const pipeSpy = jest.spyOn(archive, 'pipe');
            const directorySpy = jest.spyOn(archive, 'directory');
            const finalizeSpy = jest.spyOn(archive, 'finalize');

        
          
           
            const result = await downloadNpm(npmUrl);

            expect(result).toEqual(['test-package', '1.0.0', expect.any(String), expect.any(String)]);
            expect(pipeSpy).toHaveBeenCalled();
            expect(directorySpy).toHaveBeenCalled();
            expect(finalizeSpy).toHaveBeenCalled();
        });
    });*/
});
