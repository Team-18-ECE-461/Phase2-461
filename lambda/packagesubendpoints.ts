import { S3, GetObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import getgithuburl from 'get-github-url'
import * as crypto from 'crypto';
import * as tar from 'tar'; 
import * as esbuild from 'esbuild';
import unzipper from 'unzipper';
import archiver from 'archiver';

const s3 = new S3();
const dynamoDBclient = new DynamoDBClient({});
const BUCKET_NAME = 'packagesstorage';
const TABLE_NAME = 'PackageInfo';

interface LambdaEvent {
    httpMethod: string,
    pathParameters: { id: string },
    body: string
}

export const lambdaHandler = async (event: LambdaEvent) => {
  const httpMethod = event.httpMethod;
  const requestBody = JSON.parse(event.body);
  const packageId =event.pathParameters.id;

  switch (httpMethod) {
    case 'GET':
      return await handleGetPackage(packageId);
    case 'POST':
      return await handleUpdatePackage(event);
    case 'DELETE':
      return await handleDeletePackage(packageId);
    default:
      return {
        statusCode: 405,
        body: JSON.stringify({ message: 'Method Not Allowed' }),
      };
  }
};

async function handleGetPackage(packageId: string) {
    try {
        if (!packageId) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request' }) };
        }
        const params = {
          TableName: TABLE_NAME,               // The DynamoDB table to query
          IndexName: "ID-index",               // Specify the GSI name here
          KeyConditionExpression: "ID = :id",  // Search for items where ID equals a specific value
          ExpressionAttributeValues: { 
              ":id": { S: packageId },         // The actual value for the ID (a string type in this case)
          },
      };
        const result = await dynamoDBclient.send(new QueryCommand(params));
        const items = result.Items;
        let packageVersion = 'No version';
        let packageName = 'No name';
        let JSProgram = 'No JSProgram';
        
        if (!items || items.length === 0) {
          return { statusCode: 404, body: JSON.stringify({ message: 'Package not found' }) };
        }



        items.forEach((item) => {
            packageVersion = item.Version.S? item.Version.S : 'No version';
            packageName = item.Name.S? item.Name.S : 'No name';
            JSProgram = item.JSProgram.S? item.JSProgram.S : 'No JSProgram';
        });

        if(packageVersion === 'No version') {
            return { statusCode: 404, body: JSON.stringify({ message: 'Version not found' }) };
        }

        const s3Client = new S3();
        const key = `${packageName}-${packageVersion}`;
        const param = {
            Bucket: BUCKET_NAME,
            Key: key
          };
      
        const data = await s3Client.send(new GetObjectCommand(param));
        let base64Content = '';
        
      
        // Convert the Body stream to a Buffer
        if(data && data.Body) {
            const stream = data.Body as NodeJS.ReadableStream;
            const chunks: Buffer[] = [];
            let done, value;
             // Collect data chunks from the stream
            for await (const chunk of stream[Symbol.asyncIterator]()) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const buffer = Buffer.concat(chunks);
            base64Content = buffer.toString('base64');
        }

        return { statusCode: 200, body: JSON.stringify({
            metadata: {
                Name: packageName,
                Version: packageVersion,
                ID: packageId,
              },
              data: {
                Content: base64Content,
                JSProgram: JSProgram,
                },
            })};
              
      } catch (error) {
        console.error('Error fetching package:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error retrieving package' }) };
      }
}

async function handleUpdatePackage(event: LambdaEvent) {
    try {
        const requestBody = JSON.parse(event.body);
        const packageId = requestBody.metadata.ID;
        const packageName = requestBody.metadata.Name;
        const packageVersion = requestBody.metadata.Version;
        let content = requestBody.data.Content;
        let url = requestBody.data.URL;
        const JSProgram = requestBody.data.JSProgram;
        const debloat = requestBody.data.debloat;
        



        if(!content && !url || content && url) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request' }) };
        }

        const checkParams = {
          TableName: TABLE_NAME,
          IndexName: "ID-index", // Specify the GSI name here
          KeyConditionExpression: "ID = :packageId",
          ExpressionAttributeValues: {
              ":packageId": { S: packageId }
          }
      };
      
      
        const checkResult = await dynamoDBclient.send(new QueryCommand(checkParams));
        
        
        if (!checkResult.Items) {
            return { statusCode: 404, body: JSON.stringify({ message: "Package not found" }) };
        }

        const versionisValid = await checkValidVersion(packageName, packageVersion);
        

        if(!versionisValid)
        {
            return { statusCode: 400, body: JSON.stringify({ message: "Version already exists" }) };
        }


        if(content){
          if (checkResult.Items.some(item => item.URL)) { //check if the package has a URL(was not uploaded by content)
            return { statusCode: 400, body: JSON.stringify({ message: "Invalid request" }) };
          }

          const mostRecentVersion  = await getMostRecentVersion(packageName);
          if (mostRecentVersion && !checkValidVersionContent(packageVersion, mostRecentVersion)) {  //check for invalid patch
            return { statusCode: 400, body: JSON.stringify({ message: "Invalid version" }) };
          }
        }
        if(url){
          if(!checkResult.Items.some(item => item.URL)) { //check if the package has a URL(was not uploaded by content)
            return { statusCode: 400, body: JSON.stringify({ message: "Invalid request" }) };
          }
        }

        if(debloat){
          const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'package-'));
          const packagedebloatName = packageName;
          const version = packageVersion;
          let packagePath = ''
          let tempversion = ''
          let tempname = ''
          if(url && url.includes('npmjs.com')) {
            [packagePath, tempversion, tempname] =  await downloadAndExtractNpmPackage(url, tempDir, packageName, packageVersion);
          }
          else if(content){
            packagePath = await extractBase64ZipContent(content, tempDir);
          }
          else if(url && url.includes('github.com')){
            const [owner, repo]: [string, string] = parseGitHubUrl(url) as [string, string];
            [packagePath, tempversion] = await downloadAndExtractGithubPackage(url, tempDir, owner, repo);
          }
          const outputDir = path.join(tempDir, 'debloated');
      fs.mkdirSync(outputDir, { recursive: true });


      
      let entryPath = getEntryPoint(path.join(packagePath, 'package.json'));
      for(let i = 0; i < entryPath.length; i++){
        entryPath[i] = path.join(packagePath, entryPath[i]);
      }

      const updatedEntryPath = [];
      for (const entry of entryPath) {
        if(fs.existsSync(entry)){
          const stats = await fs.promises.stat(entry);
          if (stats.isDirectory()) {
            updatedEntryPath.push(path.join(entry, '*.js'));
          } else {
            updatedEntryPath.push(entry);
          }
        }
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
    const packageJsonPath = path.join(packagePath, 'package.json');
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
      statusCode: 200,
      body: "Package updated successfully",
    };
  }
  else{

    //let zipBuffer: Buffer;
    let registryUrl = '';
    let tarballUrl = '';
    let response;
    let zippath = '';
    let tname, tversion;
    if(url && url.includes('npmjs.com')){
        const [tid, tname, tversion, base64Zip] = await downloadNpm(url);
     
        // const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'package-'));
        // [zippath, tname, tversion] = await downloadAndExtractNpmPackage(url, tempDir, packageName, packageVersion);
        // const outputZipPath = path.join(tempDir, 'output.zip');
        // await zipFolder(zippath, outputZipPath);
        // const uploadkey = `${packageName}-${packageVersion}`;
        // const debloatID = generatePackageId(packageName, packageVersion);
        // const zipBuffer = fs.readFileSync(outputZipPath);
        // const base64Zip = zipBuffer.toString('base64');
        // await uploadToS3(outputZipPath, BUCKET_NAME, uploadkey);
        // await cleanupTempFiles(tempDir);
        // await uploadDB(debloatID, packageName, packageVersion, JSProgram, url);
        return {
          statusCode: 200,
          body: "Package updated successfully",
        };
      
    }
    else{
      let zipBuffer: Buffer;
      if (content) {
        zipBuffer = Buffer.from(content, 'base64');
      }
      else if (url && url.includes('github.com')) {
        url = await urlhandler(url);
        const [owner, repo]: [string, string] = parseGitHubUrl(url) as [string, string];
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
        const response0 = await axios.get(apiUrl);
        const branch = response0.data.default_branch;
        const response = await axios.get(`${url}/archive/refs/heads/${branch}.zip`, { responseType: 'arraybuffer' });
        zipBuffer = Buffer.from(response.data);
      } else { 
        throw new Error('No content or URL provided');
      }

      const packageId = generatePackageId(packageName, packageVersion);
      let key = `${packageName}-${packageVersion}`;
      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: zipBuffer,
        ContentType: 'application/zip',
      });
      uploadDB(packageId, packageName, packageVersion, JSProgram, url);   
      return {
        statusCode: 200,
        body: "Package updated successfully",
      }; 
    }

  
}
  }

  catch (error) {
        console.error('Error updating package:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error updating package' }) };
    }
}

async function handleDeletePackage(id:string){
    try {
        const params = {
            TableName: TABLE_NAME,
            Key: {
              ID: { S: id }
            }
          };
      
        const result = await dynamoDBclient.send(new GetItemCommand(params));
      
        if (!result.Item) {
            return { statusCode: 404, body: JSON.stringify({ message: 'Package not found' }) };
        }

        const key = `${id}/${result.Item.Version.S}`;
        const s3 = new S3();
        const s3Params = {
            Bucket: BUCKET_NAME,
            Key: key
          };

        await s3.deleteObject(s3Params);
        await dynamoDBclient.send(new DeleteItemCommand(params));
      
        return { statusCode: 200, body: JSON.stringify({ message: 'Package deleted' }) };
    } catch (error) {
        console.error('Error deleting package:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error deleting package' }) };
    }

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

async function getMostRecentVersion(packageName: string) {
  const params = {
      TableName: TABLE_NAME,                 // Replace with your table name
      KeyConditionExpression: "#name = :name",
      ExpressionAttributeNames: { "#name": "Name"},// Query by the package name
      ExpressionAttributeValues: {
          ":name": { S: packageName },       // The name you're querying for
      },
      ProjectionExpression: "VersionInt"     // Only retrieve the versionInt attribute
  };

  try {
      const result = await dynamoDBclient.send(new QueryCommand(params));
      
      if (result.Items && result.Items.length > 0) {
          // Extract versionInt values from each item
          const versionInts = result.Items.map(item => Number(item.VersionInt.N));
          return Math.max(...versionInts);
      } else {
          console.log("No versions found for this package.");
          return null;
      }
  } catch (error) {
      console.error("Error querying DynamoDB:", error);
      return null;
  }
}

async function checkValidVersionContent(version:string, mostRecentVersion:number) {
  const [major, minor, patch] = version.split('.').map(Number);
  const mostRecentMajor: number = Math.floor((mostRecentVersion) / 1000000);
  const mostRecentMinor = Math.floor((mostRecentVersion % 1000000) / 1000);
  const mostRecentPatch = mostRecentVersion % 1000;

  

  // If the major and minor versions are the same, check for sequential patch updates
  if (major === mostRecentMajor && minor === mostRecentMinor) {
    return patch > mostRecentPatch;
  }

  // Otherwise, the incoming version is not valid
  return true;
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
  function getEntryPoint(packageJsonPath: string): string[] {
    const filePaths = [];
    const packageJson = require(packageJsonPath);
  
    // Check for index.js first
    const indexPath = path.join(path.dirname(packageJsonPath), 'index.js');
    const sourceindexPath = path.join(path.dirname(packageJsonPath), 'source/index.js');
    const srcindexPath = path.join(path.dirname(packageJsonPath), 'src/index.js');
  
    if(packageJson.main){
      filePaths.push(packageJson.main);
    }
    else if (fs.existsSync(indexPath)) {
      filePaths.push('index.js');
    }
  
    else if (fs.existsSync(sourceindexPath)) {
      filePaths.push('source/index.js');}
  
    else if (fs.existsSync(srcindexPath)) {
      filePaths.push('src/index.js');
    }
  
    else if(packageJson.exports){
      const entryPoint = packageJson.exports['.'] || packageJson.exports['./index.js'];
      if(entryPoint){
        filePaths.push(entryPoint);
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
    else if (packageJson.bin && typeof packageJson.bin === 'object') {
      const binFiles = Object.values(packageJson.bin);
      if (binFiles.length > 0) {
        for (const binFile of binFiles) {
          filePaths.push(binFile);
      }
    }
  
  }  
  
   
  
    return filePaths
    
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
  function versionInt(version: string): number{
    const [major, minor, patch] = version.split('.').map(Number);
    return major * 1000000 + minor * 1000 + patch;
  }
  async function downloadAndExtractNpmPackage(npmUrl: string, destination: string, packageName: string, packageVersion:string): Promise<any> {
    // Convert npm URL to registry API URL
    let registryUrl = npmUrl
    let response;
    let tarballUrl;
    if (npmUrl.includes( '/v/')){
       registryUrl = npmUrl.replace('https://www.npmjs.com/package/', 'https://registry.npmjs.org/').replace('/v/', '/');
       response = await axios.get(registryUrl);
       tarballUrl = response.data.dist.tarball;
      }
    else{
        registryUrl = npmUrl.replace('https://www.npmjs.com/package/', 'https://registry.npmjs.org/');
        response = await axios.get(registryUrl);
        const latestVersion = response.data['dist-tags'].latest;
        tarballUrl = response.data.versions[latestVersion].dist.tarball;
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
  
    // Extract tarball
    await tar.extract({ file: tarballPath, cwd: destination });
    return [path.join(destination, 'package'), packageVersion, packageName]; // Adjust this based on the extracted directory structure
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
  async function extractBase64ZipContent(base64Content: string, destination: string): Promise<string> {
    const zipPath = path.join(destination, 'package.zip');
    const buffer = Buffer.from(base64Content, 'base64');
    await fs.promises.writeFile(zipPath, buffer);
  
    // Extract zip content
    await fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: destination }))
        .promise();
  
    return path.join(destination, 'package'); // Adjust based on zip structure
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

  async function checkValidVersion(packageName: string, version: string): Promise<boolean> {
    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: "#name = :name",
        ExpressionAttributeNames: { "#name": "Name" },
        ExpressionAttributeValues: {
            ":name": { S: packageName }
        },
    };
  
    try {
        const result = await dynamoDBclient.send(new QueryCommand(params));
        if(!result.Items){
          return false;
        }
        const existingVersions = result.Items.map(item => item.Version.S);
        if(existingVersions.includes(version)){
          return false;
        }
        return true;
    } catch (error) {
        console.error('Error checking version:', error);
        return false;
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
  

