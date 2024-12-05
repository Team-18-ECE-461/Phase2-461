import { S3, Type } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import axios from 'axios';
import JSZIP, { file } from 'jszip';
import getgithuburl from 'get-github-url'
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

export async function urlhandler(url:string){
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
        [packagePath,version] = await downloadAndExtractGithubPackage(url, tempDir, owner, repo);
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
      let entryPath = fs.existsSync(path.join(packagePath, 'package.json')) ? getEntryPoint(path.join(packagePath, 'package.json')) : [];
      if (entryPath.length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify('No entry point found'),
        };
      }

      for(let i = 0; i < entryPath.length; i++){
        entryPath[i] = path.join(packagePath, entryPath[i]);
      }

      const updatedEntryPath: string[] = [];
      for (const entry of entryPath) {
        if(fs.existsSync(entry)){
          const stats = await fs.promises.stat(entry);
          if (stats.isDirectory()) {
            updatedEntryPath.push(path.join(entry, '*.js'));
          } else {
            updatedEntryPath.push(entry);
          }}
      }
      entryPath = updatedEntryPath;

      

      if (entryPath.length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify('No entry point found'),
        };
      }

      //unzipPackageForDependencies(packagePath);
      
      console.log(entryPath)

      await esbuild.build({
        entryPoints: entryPath, 
        bundle: false,
        outdir: outputDir,
        minify: true,
        treeShaking: true,
    });

    // Copy package.json to the output directory
    let packageJsonPath = '';
    if(fs.existsSync(path.join(packagePath, 'package.json'))){
      packageJsonPath = path.join(packagePath, 'package.json');
    }
    else if (fs.existsSync(path.join(tempDir, 'package.json'))){
      packageJsonPath = path.join(tempDir, 'package.json');
    }
    else if(fs.existsSync(path.join(packagePath, 'package/package.json'))){
      packageJsonPath = path.join(packagePath, 'package/package.json');
    }
    else{
      return {
        statusCode: 400,
        body: JSON.stringify('No package.json found'),
      };
    }

    const outputPackageJsonPath = path.join(outputDir, 'package.json');
    await fs.promises.copyFile(packageJsonPath, outputPackageJsonPath);

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
    let packageVersion = '1.0.0'; // Default package version if content is provided
    // Retrieve zip file contents
    if(url && url.includes('npmjs.com')){
      let zippath: string;
      
      const [tid, tname, tversion, base64Zip, existing] = await downloadNpm(url, JSProgram);
      if(existing){
        return {
          statusCode: 409,
          body: JSON.stringify('Package already exists'),
        };
      }
     
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
      version = await getVersionFromGithub(owner, repo);
      if(version.includes('v')){version = version.replace('v', '');}
      if(version !== ''){packageVersion = version;}
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
   
    
    //if url provided, get package name and version from package.json
    if(packageJsonFile && url ){
      const packageJsonContent = await (packageJsonFile as JSZIP.JSZipObject).async('string');
      const packageInfo = JSON.parse(packageJsonContent);

      packageName = packageInfo.name 
      if(packageInfo.version && packageVersion === '1.0.0'){ 
        packageVersion = packageInfo.version}
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
        headers: {
          origin: 'https://main.d1wnqo5xxzp8bu.amplifyapp.com/', // Replace with your frontend's URL
          methods: 'GET,POST,PUT,DELETE', // Allowed HTTP methods
          allowedHeaders: ['Content-Type', 'Authorization'], // Allowed HTTP headers
        },
      }),
    };
  }
  

   
}catch (error) {
    // console.error('Error processing request:', error);
    return {
      statusCode: 500,
      body: JSON.stringify('Failed to process the request.'),
    };
  }
};


export function versionInt(version: string): number{

  let [major, minor, patch] = version.split('.').map(Number);
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    [major, minor, patch] = version.split('-')[0].split('.').map(Number);
  }
  if(isNaN(major) || isNaN(minor) || isNaN(patch)){
    return 0;
  }  
  return major * 1000000 + minor * 1000 + patch;
}

export async function getVersionFromGithub(owner: string, repo: string): Promise<string> {
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
export async function downloadNpm(npmUrl:string, JSProgram:string){
  try {let registryUrl = npmUrl
    let response;
    let tarballUrl;
    let version;
    let packageName;
    const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'npm-'));  //tmpdir = /tmp/npm-
    if (npmUrl.includes( '/v/')){
      registryUrl = npmUrl.replace('https://www.npmjs.com/package/', 'https://registry.npmjs.org/').replace('/v/', '/');
      try{
      response = await axios.get(registryUrl);}
      catch(error){
        //console.log('Error fetching package data:', error);
        throw error;
      }
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
    const existingPackage = await dynamoDBclient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#name = :name and Version = :version',
        ExpressionAttributeNames: {
            '#name': 'Name', // Alias for reserved keyword 'Name'
        },
        ExpressionAttributeValues: {
            ':name': { S: packageName },
            ':version': { S: version },
        },
      })
  );

  if (existingPackage.Items && existingPackage.Items.length > 0) {
    return [packageName, version, generatePackageId(packageName, version), base64content, true];
  }
    await uploadToS3(zipPath, BUCKET_NAME, `${packageName}-${version}`);
    await cleanupTempFiles(tarballPath);
    await cleanupTempFiles(extractPath);
    await cleanupTempFiles(zipPath);
    await uploadDB(generatePackageId(packageName, version), packageName, version, JSProgram, npmUrl);
    let id = generatePackageId(packageName, version);
    return [packageName, version, id, base64content, false];
  } catch (error) {
    //console.log('Error downloading npm package:', error);
    throw error;
  }
}

export function parseGitHubUrl(url: string): [ owner: string, repo: string ] | null {
  try {
      const parsedUrl = new URL(url);
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

      if (pathSegments.length >= 2) {
          const [owner, repo] = pathSegments;
          return [ owner, repo.replace(/\.git$/, '') ]; // Remove ".git" if present
      }
      return null;
  } catch (error) {
      
      // console.error('Invalid URL:', error);
      return null;
  }
}
 

export async function downloadAndExtractNpmPackage(npmUrl: string, destination: string): Promise<any> {
  // Convert npm URL to registry API URL
  console.log(destination, "is destination")
  console.log("should return", path.join(destination, 'package'))
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

export async function downloadAndExtractGithubPackage(githubUrl: string, destination: string, owner: string, repo: string): Promise<any> {
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
  let vers = await getVersionFromGithub(owner, repo);
  if(vers.includes('v')){vers = vers.replace('v', '');}
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
        version = vers.length > 0 ? vers : packageJson.version;
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

export function generatePackageId(name: string, version: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${name}-${version}`);
  return hash.digest('hex').slice(0, 12); // Truncate for a shorter ID
}

// Function to clean up temporary files
export async function cleanupTempFiles(tempFilePath: string): Promise<void> {
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


export async function extractBase64ZipContent(base64Content: string, destination: string, repo: string, branch: string): Promise<string> {
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

export async function zipFolder(source: string, out: string) {
  const archive = fs.createWriteStream(out);
  const zipper = archiver('zip', {
      zlib: { level: 9 }  // High compression level
  });

  zipper.pipe(archive);
  zipper.directory(source, false);
  await zipper.finalize();
}

export async function uploadToS3(filePath: string, bucketName: string, key: string) {
  try{
  const fileStream = fs.createReadStream(filePath);
  await s3.putObject({
      Bucket: bucketName,
      Key: key,
      Body: fileStream,
      ContentType: 'application/zip',
  });}
  catch(error){
    throw error
  }

}

export async function checkexistingPackage(packageName: string, packageVersion: string){
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

export async function uploadDB(packageId: string, packageName: string, packageVersion: string, JSProgram: string, url: string){
  if(packageVersion.includes('v')){
    packageVersion = packageVersion.replace('v', '');
  }
  const item = {
    ID: { S: packageId },
    Name: { S: packageName },
    Version: { S: packageVersion },
    VersionInt: { N: versionInt(packageVersion).toString() },
    JSProgram: { S: JSProgram? JSProgram : '' },
    CreatedAt: { S: new Date().toISOString() },
    URL: { S: url? url : '' },
  };

  await dynamoDBclient.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: item
  }));

}

export function getEntryPoint(packageJsonPath: string): string[] {
  const filePaths: string[] = [];
  const packageJson = require(packageJsonPath);

  // Check for index.js first
  const indexPath = path.join(path.dirname(packageJsonPath), 'index.js');
  const indexPath2 = path.join(path.dirname(packageJsonPath), 'src/index.ts');
  const sourceindexPath = path.join(path.dirname(packageJsonPath), 'source/index.js');
  const sourceindexPath2 = path.join(path.dirname(packageJsonPath), 'source/index.ts');
  const srcindexPath = path.join(path.dirname(packageJsonPath), 'src/index.js');
  const srcindexPath2 = path.join(path.dirname(packageJsonPath), 'src/index.ts');
  const src = path.join(path.dirname(packageJsonPath), 'src');
  const source = path.join(path.dirname(packageJsonPath), 'source');
  if(packageJson.main){
    filePaths.push(packageJson.main);
  }
  if (fs.existsSync(indexPath)) {
    filePaths.push('index.js');
  }
  else if (fs.existsSync(indexPath2)) {
    filePaths.push('src/index.ts');
  }
  else if (fs.existsSync(sourceindexPath)) {
    filePaths.push('source/index.js');
  }
  else if (fs.existsSync(sourceindexPath2)) {
    filePaths.push('source/index.ts');
  }
  else if (fs.existsSync(srcindexPath)) {
    filePaths.push('src/index.js');
  }
  else if (fs.existsSync(srcindexPath2)) {
    filePaths.push('src/index.ts');
  }
  else if (fs.existsSync(src)) {
    filePaths.push('src');
  }
  else if (fs.existsSync(source)) {
    filePaths.push('source');}

 
  

  else if(packageJson.exports){
    const entryPoint = packageJson.exports['.'] || packageJson.exports['./index.js'];
    if (entryPoint) {
      const entryPointPath = path.join(path.dirname(packageJsonPath), entryPoint);
      const stats = fs.statSync(entryPointPath);
      if (stats.isDirectory()) {
        filePaths.push(path.join(entryPoint, '*.js'));
      } else {
        filePaths.push(entryPoint);
      }
    }
  }

  // If nothing found in bin, check the files category (if defined)
  if (packageJson.files && packageJson.files.length > 0) {
    for (const file of packageJson.files) {
      filePaths.push(file);
      // const filePath = path.join(path.dirname(packageJsonPath), file);
      // if (fs.existsSync(filePath)) {
      //   return file;
      // }
    }
  }

  

  // If index.js doesn't exist, check the bin category
  if (packageJson.bin && typeof packageJson.bin === 'object') {
    const binFiles = Object.values(packageJson.bin);
    if (binFiles.length > 0) {
      for (const binFile of binFiles) {
        filePaths.push(binFile as string);
    }
  }

}  

 

  return filePaths
  
}



