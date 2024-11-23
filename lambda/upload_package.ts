import { S3, Type } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import axios from 'axios';
import JSZIP from 'jszip';
import getgithuburl from 'get-github-url'
import * as UglifyJS from 'uglify-js';
import * as crypto from 'crypto';
import { relative } from 'path';
import fs from 'fs';
import path from 'path';
import * as esbuild from 'esbuild';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import unzipper from 'unzipper';
import stream from 'stream';
import * as tar from 'tar'; 
import { exec } from 'child_process';

interface LambdaEvent {
  body: string;
  // Content?: string;
  // URL?: string;
  // JSProgram: string;
}

async function urlhandler(url:string){
  if(url.includes('github')){
    const repoNameMatch = url.match(/github\.com\/[^\/]+\/([^\/]+)/);
    if (repoNameMatch && repoNameMatch[1]) {
      return url ;
    }
  }
  else if(url.includes('npm')){
    try {
      const match = url.match(/\/package\/([^\/]+)/); // Match the pattern
      const packageName=  match ? match[1] : null
      const response = await axios.get(`https://registry.npmjs.org/${packageName}`, { responseType: 'json' });
      const repositoryUrl = response.data.repository?.url;
      if (repositoryUrl) {
        url = getgithuburl(repositoryUrl);
      } else {
        throw new Error('No repository URL found');
      }
      const repoNameMatch = url.match(/github\.com\/[^\/]+\/([^\/]+)/);
      if (repoNameMatch && repoNameMatch[1]) {
        return url;
      }
    } catch (error) {
      console.error(`Error fetching package data: ${error}`);
    }
    
  }
  }



const s3 = new S3();
const dynamoDBclient = new DynamoDBClient({});
const BUCKET_NAME = 'packagesstorage';
const TABLE_NAME = 'PackageInfo';

export const lambdaHandler = async (event: LambdaEvent): Promise<any> => {
  try {

    const requestBody = JSON.parse(event.body);
    let content = requestBody.Content;
    let url = requestBody.URL;
    const JSProgram = requestBody.JSProgram;
    let name = requestBody.Name;
    let debloat = requestBody.debloat;

    // Check if either content or url is set, but not both
    if ((!content && !url) || (content && url) || content && name.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify('Invalid Request Body!'),
      };
    }

    let packagePath;
    let version ;
    let packagedebloatName ;

    if(debloat){
      const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'package-')); 
      if(url && url.includes('npmjs.com')){
        [packagePath, version, packagedebloatName] = await downloadAndExtractNpmPackage(url, tempDir);
      }

      if(url && url.includes('github')){
        const [owner, repo]: [string, string] = parseGitHubUrl(url) as [string, string];
        // const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
        // const response0 = await axios.get(apiUrl);
        // const branch = response0.data.default_branch;
        // const response = await axios.get(`${url}/archive/refs/heads/${branch}.zip`, { responseType: 'arraybuffer' });
        // // const response2 = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {headers: { 'Accept': 'application/vnd.github.v3+json' }});
        // // version = response2.data.tag_name.slice(1) || '1.0.0';
        // version = (await getVersionFromGithub(owner, repo)).slice(1) || '1.0.0';
        // const zipBuffer = Buffer.from(response.data);
        // content = zipBuffer.toString('base64');
        // packagePath = await extractBase64ZipContent(content, tempDir, repo, branch);
        // packagedebloatName = name;
        packagePath = await downloadAndExtractGithubPackage(url, tempDir, owner, repo);
        //version = (await getVersionFromGithub(owner, repo)).slice(1) || '1.0.0';
        if(!name){
          name = repo;
        }
        packagedebloatName = name;

        
      }

      else if(content){
        packagePath = await extractBase64ZipContent(content, tempDir, name, 'main');
        packagedebloatName = name;
        version = '1.0.0';

      }
      const outputDir = path.join(tempDir, 'debloated');
      fs.mkdirSync(outputDir, { recursive: true });


      
      let entryPath = getEntryPoint(path.join(packagePath, 'package.json'));
      entryPath = entryPath ? path.join(packagePath, entryPath) : null;

      if (!entryPath) {
        return {
          statusCode: 400,
          body: JSON.stringify('No entry point found'),
        };
      }

      //unzipPackageForDependencies(packagePath);

      await esbuild.build({
        entryPoints: [entryPath], 
        bundle: false,
        outdir: outputDir,
        minify: true,
        treeShaking: true,
    });

    const debloatedZipPath = path.join(tempDir, 'debloated.zip');
    await zipFolder(outputDir, debloatedZipPath);
    const uploadkey = `${packagedebloatName}-${version}`;
    const debloatID = generatePackageId(packagedebloatName, version);
    
    let base64Zip ;

    if(await checkexistingPackage(packagedebloatName, version) === false){
      const zipBuffer = fs.readFileSync(debloatedZipPath);
      base64Zip = zipBuffer.toString('base64');
      await uploadToS3(debloatedZipPath, BUCKET_NAME, uploadkey);
      await cleanupTempFiles(tempDir);
    }
    else{
      await cleanupTempFiles(tempDir);
      return {
        statusCode: 409,
        body: JSON.stringify('Package already exists'),
      };
    }
    await uploadDB(debloatID, packagedebloatName, version, JSProgram, url);
    return {
      statusCode: 201,
      body: JSON.stringify({
        metadata: {
          Name: packagedebloatName,
          Version: version,
          ID: debloatID,
        },
        data: {
          Content: base64Zip,
          URL: url, 
          JSProgram: JSProgram,
        },
      }),
    };
  }

  else{ //no debloat
    let zipBuffer: Buffer;
    let base64Zip: string;
    // Retrieve zip file contents
    if(url && url.includes('npmjs.com')){
      let zippath: string;
      
      const [tid, tname, tversion, base64Zip] = await downloadNpm(url);
      return {
        statusCode: 201,
        body: JSON.stringify({
          metadata: {
            Name: tname,
            Version: tversion,
            ID: tid,
          },
          data: {
            Content: base64Zip,
            URL: url, 
            JSProgram: JSProgram,
          },
        }),
      };
    
    }
      
    if (content) {
      zipBuffer = Buffer.from(content, 'base64');
    }
   else if (url) {
      url = await urlhandler(url);
      const [owner, repo]: [string, string] = parseGitHubUrl(url) as [string, string];
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
      const response0 = await axios.get(apiUrl);
      const branch = response0.data.default_branch;
      const response = await axios.get(`${url}/archive/refs/heads/${branch}.zip`, { responseType: 'arraybuffer' });
      //const response = await axios.get(`${url}/archive/refs/heads/main.zip`, { responseType: 'arraybuffer' });
      zipBuffer = Buffer.from(response.data);
    } else {
      throw new Error('No content or URL provided');
    }

    // Load zip content to inspect package.json
    const zip = await JSZIP.loadAsync(zipBuffer);
    content  = zipBuffer.toString('base64');
    
    let tpackageJsonFile: JSZIP.JSZipObject | null = null;
    zip.forEach((relativePath, file) => {
    if (relativePath.endsWith('package.json')) {
      tpackageJsonFile = zip.file(relativePath); // Capture the relative path to package.json
    }
    });
    const packageJsonFile = tpackageJsonFile;

    let packageName = name; // Default package name if content is provided
    let packageVersion = '1.0.0'; // Default package version if content is provided
    
    //if url provided, get package name and version from package.json
    if(packageJsonFile && url ){
      const packageJsonContent = await (packageJsonFile as JSZIP.JSZipObject).async('string');
      const packageInfo = JSON.parse(packageJsonContent);

      packageName = packageInfo.name 
      packageVersion = packageInfo.version
    }

    // Generate package ID
    const packageId = generatePackageId(packageName, packageVersion);
    


    //key for S3 bucket
    let key = `${packageName}-${packageVersion}`;

    // Check if the package already exists in DynamoDB
    const existingPackage = await dynamoDBclient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#name = :name and Version = :version',
        ExpressionAttributeNames: {
            '#name': 'Name', // Alias for reserved keyword 'Name'
        },
        ExpressionAttributeValues: {
            ':name': { S: packageName },
            ':version': { S: packageVersion },
        },
      })
  );

  if (existingPackage.Items && existingPackage.Items.length > 0) {
      return {
          statusCode: 409, // Conflict
          body: JSON.stringify({
              message: 'Package already exists',
              package: existingPackage.Items,
          }),
      };
  }

    // Upload zip file to S3 if the package does not already exist
    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: zipBuffer,
      ContentType: 'application/zip',
    });

    // Save package details to DynamoDB
    uploadDB(packageId, packageName, packageVersion, JSProgram, url);

  

  
    return {
      statusCode: 201,
      body: JSON.stringify({
        metadata: {
          Name:packageName,
          Version: packageVersion,
          ID: packageId,
        },
        data: {
          Content: content,
          URL: url, 
          JSProgram: JSProgram,
        },
      }),
    };
  }
  

   
}catch (error) {
    console.error('Error processing request:', error);
    return {
      statusCode: 500,
      body: JSON.stringify('Failed to process the request.'),
    };
  }
};


function versionInt(version: string): number{
  const [major, minor, patch] = version.split('.').map(Number);
  return major * 1000000 + minor * 1000 + patch;
}

async function getVersionFromGithub(owner: string, repo: string): Promise<string> {
  try {
    // Attempt to fetch the latest release
    const releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const releaseResponse = await axios.get(releaseUrl);
    return releaseResponse.data.tag_name; // or .name based on your preference
} catch (error: any) { 
    if (error.response?.status === 404) {
        // Fallback to tags if no releases are found
        console.warn(`No releases found. Falling back to tags.`);
        const tagsUrl = `https://api.github.com/repos/${owner}/${repo}/tags`;
        const tagsResponse = await axios.get(tagsUrl);
        if (tagsResponse.data.length > 0) {
            return tagsResponse.data[0].name; // Return the most recent tag
        } else {
            throw new Error(`No releases or tags found for ${owner}/${repo}.`);
        }
    } else {
        throw error; // Re-throw for other errors
    }
}
}
async function downloadNpm(npmUrl:string){
  try {let registryUrl = npmUrl
    let response;
    let tarballUrl;
    let version;
    let packageName;
    const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'npm-'));  //tmpdir = /tmp/npm-
    if (npmUrl.includes( '/v/')){
      registryUrl = npmUrl.replace('https://www.npmjs.com/package/', 'https://registry.npmjs.org/').replace('/v/', '/');
      response = await axios.get(registryUrl);
      version = npmUrl.split('/v/')[1];
      packageName = response.data.name;
      tarballUrl = response.data.dist.tarball;
      }
    else{
        registryUrl = npmUrl.replace('https://www.npmjs.com/package/', 'https://registry.npmjs.org/');
        response = await axios.get(registryUrl);
        version = response.data['dist-tags'].latest;
        tarballUrl = response.data.versions[version].dist.tarball;
        packageName = response.data.name
    }

    const dresponse = await axios.get(tarballUrl, { responseType: 'stream' });
    const tarballPath = path.join(tempDir, `package.tgz`); // /tmp/npm-/packageName.tgz
    const writer = fs.createWriteStream(tarballPath); //write tarball to /tmp/npm-/packageName.tgz
   

    await new Promise((resolve, reject) => {
      dresponse.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Step 2: Extract the tarball
    const extractPath = path.join(tempDir, 'package');  //extractPath = /tmp/npm-/package
    await fs.promises.mkdir(extractPath);
    // await tar.x({
    //     file: tarballPath,
    //     cwd: extractPath,
    // });
    await tar.extract({ file: tarballPath, cwd: tempDir });
    
    const zipPath = path.join(tempDir, `package.zip`); // /tmp/npm-/packageName.zip
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    archive.pipe(output);
    archive.directory(extractPath, false);  //zip from /tmp/npm-/packageName to /tmp/npm-/packageName.zip
    await archive.finalize();

    await new Promise((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
  });

    let base64content = fs.readFileSync(zipPath).toString('base64');  //read from /tmp/npm-/packageName.zip to content

    await uploadToS3(zipPath, BUCKET_NAME, `${packageName}-${version}`);
    await cleanupTempFiles(tarballPath);
    await cleanupTempFiles(extractPath);
    await cleanupTempFiles(zipPath);
    await uploadDB(generatePackageId(packageName, version), packageName, version, '', npmUrl);
    let id = generatePackageId(packageName, version);
    return [packageName, version, id, base64content];
  } catch (error) {
    console.log('Error downloading npm package:', error);
    throw error;
  }
}

function parseGitHubUrl(url: string): [ owner: string, repo: string ] | null {
  try {
      const parsedUrl = new URL(url);
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

      if (pathSegments.length >= 2) {
          const [owner, repo] = pathSegments;
          return [ owner, repo.replace(/\.git$/, '') ]; // Remove ".git" if present
      }
      return null;
  } catch (error) {
      console.error('Invalid URL:', error);
      return null;
  }
}
 

async function downloadAndExtractNpmPackage(npmUrl: string, destination: string): Promise<any> {
  // Convert npm URL to registry API URL
  let registryUrl = npmUrl
  let response;
  let tarballUrl;
  let version;
  let packageName;
  if (npmUrl.includes( '/v/')){
     registryUrl = npmUrl.replace('https://www.npmjs.com/package/', 'https://registry.npmjs.org/').replace('/v/', '/');
     response = await axios.get(registryUrl);
     version = npmUrl.split('/v/')[1];
     packageName = response.data.name;
     tarballUrl = response.data.dist.tarball;
    }
  else{
      registryUrl = npmUrl.replace('https://www.npmjs.com/package/', 'https://registry.npmjs.org/');
      response = await axios.get(registryUrl);
      version = response.data['dist-tags'].latest;
      tarballUrl = response.data.versions[version].dist.tarball;
      packageName = response.data.name

  }

  // Download the tarball
  const tarballPath = path.join(destination, 'package.tgz');
  
  const writer = fs.createWriteStream(tarballPath);
  const downloadResponse = await axios.get(tarballUrl, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
      downloadResponse.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
  });

  //console.log(downloadResponse);

  // Extract tarball
  await tar.extract({ file: tarballPath, cwd: destination });
  return [path.join(destination, 'package'), version, packageName]; // Adjust this based on the extracted directory structure
}

async function downloadAndExtractGithubPackage(githubUrl: string, destination: string, owner: string, repo: string): Promise<any> {
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball`;
  const tarballPath = path.join(destination, 'package.tar.gz');
  const writer = fs.createWriteStream(tarballPath);
  const downloadResponse = await axios.get(tarballUrl, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
      downloadResponse.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
  });
  await tar.extract({ file: tarballPath, cwd: destination });
  
  const extractedPath = path.join(destination);
  const extractedFiles = await fs.promises.readdir(extractedPath);
  const firstFolder = extractedFiles.find((file) => fs.statSync(path.join(extractedPath, file)).isDirectory());
  
  if (firstFolder) {
    console.log('Found first folder:', firstFolder);
    // return path.join(extractedPath, firstFolder); // Return the path of the first folder
    try {
      // Check if package.json exists and read it

      const packagePath = path.join(extractedPath, firstFolder, 'package.json');
      let version: string | undefined;

      if (fs.existsSync(packagePath)) {
        const packageJsonContent = await fs.promises.readFile(packagePath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);
        version = packageJson.version;
        console.log('Found version in package.json:', version);
        return [path.join(extractedPath, firstFolder), version]
      } else {
        console.log('package.json not found in:', packagePath);
      }
    } catch (error) {
      console.error('Error reading package.json:', error);
    }
  
  }



  console.log('No first folder found');
  return [extractedPath, '1.0.0'] // Adjust based on zip structure
  //return path.join(destination); // Adjust this based on the extracted directory structure

}

function generatePackageId(name: string, version: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${name}-${version}`);
  return hash.digest('hex').slice(0, 12); // Truncate for a shorter ID
}

// Function to clean up temporary files
async function cleanupTempFiles(tempFilePath: string): Promise<void> {
  try {
    // Check if the path exists
    await fs.promises.access(tempFilePath);
    const stats = await fs.promises.stat(tempFilePath);

    // Remove file or directory as needed
    if (stats.isFile()) {
      await fs.promises.unlink(tempFilePath);
    } else if (stats.isDirectory()) {
      await fs.promises.rm(tempFilePath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(`Error cleaning up temporary file or directory at ${tempFilePath}:`, error);
  }
}

async function createOptimizedZipStream(zipBuffer: Buffer, ignoredPatterns: any) {
  const buffers : Buffer[] = [];
  const optimizedZipStream = archiver('zip', { zlib: { level: 9 } });

  // Collect data into the buffer array as it is generated
  optimizedZipStream.on('data', (data) => buffers.push(data));
  
  const zipStream = new stream.PassThrough();
  zipStream.end(zipBuffer);

  const zipContents = zipStream.pipe(unzipper.Parse({ forceStream: true }));
  zipContents.on('entry', (entry) => {
    const shouldIgnore = ignoredPatterns.some((pattern: string) => entry.path.includes(pattern));
    if (!shouldIgnore) {
      optimizedZipStream.append(entry, { name: entry.path });
    } else {
      entry.autodrain();
    }
  });

  // Ensure the archive finalizes once done
  await new Promise((resolve, reject) => {
    zipContents.on('close', resolve);
    zipContents.on('error', reject);
  });
  optimizedZipStream.finalize();

  // Return combined data as a Buffer
  return Buffer.concat(buffers);
}



async function extractBase64ZipContent(base64Content: string, destination: string, repo: string, branch: string): Promise<string> {
  const zipPath = path.join(destination, 'package.zip');
  const buffer = Buffer.from(base64Content, 'base64');
  await fs.promises.writeFile(zipPath, buffer);

  // Extract zip content
  await fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: path.join(destination,'package') }))
      .promise();

  const extractedPath = path.join(destination, 'package');
  const extractedFiles = await fs.promises.readdir(extractedPath);
  const firstFolder = extractedFiles.find((file) => fs.statSync(path.join(extractedPath, file)).isDirectory());
  
  if (firstFolder) {
    console.log('Found first folder:', firstFolder);
    return path.join(extractedPath, firstFolder); // Return the path of the first folder
  }

  console.log('No first folder found');
  return extractedPath // Adjust based on zip structure
}

async function zipFolder(source: string, out: string) {
  const archive = fs.createWriteStream(out);
  const zipper = archiver('zip', {
      zlib: { level: 9 }  // High compression level
  });

  zipper.pipe(archive);
  zipper.directory(source, false);
  await zipper.finalize();
}

async function uploadToS3(filePath: string, bucketName: string, key: string) {
  const fileStream = fs.createReadStream(filePath);
  await s3.putObject({
      Bucket: bucketName,
      Key: key,
      Body: fileStream,
      ContentType: 'application/zip',
  })

}

async function checkexistingPackage(packageName: string, packageVersion: string){
  const existingPackage = await dynamoDBclient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: '#name = :name and Version = :version',
      ExpressionAttributeNames: {
          '#name': 'Name', // Alias for reserved keyword 'Name'
      },
      ExpressionAttributeValues: {
          ':name': { S: packageName },
          ':version': { S: packageVersion },
      },
    }));

  if (existingPackage.Items && existingPackage.Items.length > 0) {
    return true;
  }

  return false;
}

async function uploadDB(packageId: string, packageName: string, packageVersion: string, JSProgram: string, url: string){
  const item = {
    ID: { S: packageId },
    Name: { S: packageName },
    Version: { S: packageVersion },
    VersionInt: { N: versionInt(packageVersion).toString() },
    JSProgram: { S: JSProgram },
    CreatedAt: { S: new Date().toISOString() },
    URL: { S: url },
  };

  await dynamoDBclient.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: item
  }));

}

function getEntryPoint(packageJsonPath: string): string | null {
  const packageJson = require(packageJsonPath);

  // Check for index.js first
  const indexPath = path.join(path.dirname(packageJsonPath), 'index.js');
  if (fs.existsSync(indexPath)) {
    return 'index.js';
  }

  const sourceindexPath = path.join(path.dirname(packageJsonPath), 'source/index.js');
  if (fs.existsSync(sourceindexPath)) {
    return 'source/index.js';
  }

  const srcindexPath = path.join(path.dirname(packageJsonPath), 'src/index.js');
  if (fs.existsSync(srcindexPath)) {
    return 'src/index.js';
  }

  // If index.js doesn't exist, check the bin category
  if (packageJson.bin && typeof packageJson.bin === 'object') {
    const binFiles = Object.values(packageJson.bin);
    if (binFiles.length > 0 && fs.existsSync(path.join(path.dirname(packageJsonPath), binFiles[0] as string))) {
      return binFiles[0] as string;
    }
  }

  // If nothing found in bin, check the files category (if defined)
  if (packageJson.files && packageJson.files.length > 0) {
    for (const file of packageJson.files) {
      const filePath = path.join(path.dirname(packageJsonPath), file);
      if (fs.existsSync(filePath)) {
        return file;
      }
    }
  }

  //If nothing found in files, check the exports category (if defined)
  if(packageJson.exports){
    const entryPoint = packageJson.exports['.'] || packageJson.exports['./index.js'];
    if(entryPoint){
      return entryPoint;
    }
  }

  if(packageJson.main){
    return packageJson.main;
  }


  

  // If no entry point is found, return null
  return null;
}


function unzipPackageForDependencies(zipFilePath: string) {
  // Create a stream to read the zip file
  const unzipStream = fs.createReadStream(zipFilePath).pipe(unzipper.Parse());
  const tmpDir = fs.mkdtempSync(path.join(tmpdir(), 'package-'));
  
  unzipStream.on('entry', entry => {
    // If we encounter package.json, extract it temporarily for installation
    if(entry.type === 'File'){
      if (entry.path === 'package.json') {
        entry.pipe(fs.createWriteStream(path.join(tmpDir, 'package.json')));
      }
      else{
        entry.autodrain();
      }
    } 
    else {
        entry.autodrain(); // Ignore other files
      }
    });

  unzipStream.on('close', () => {
    console.log('package.json extracted temporarily');
    installDependencies(tmpDir);  // Install dependencies in temp directory
  });
}


function installDependencies(dir:string) {
  exec('npm install', { cwd: dir }, (err, stdout, stderr) => {
    if (err) {
      console.error('Error installing dependencies:', stderr);
      return;
    }
    console.log('Dependencies installed:', stdout);
  });
}