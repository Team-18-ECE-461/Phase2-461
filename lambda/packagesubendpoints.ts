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
let flag = 0;

interface LambdaEvent {
    httpMethod: string,
    pathParameters: { id: string },
    body: string
}

export const lambdaHandler = async (event: LambdaEvent) => {
  const httpMethod = event.httpMethod;
  const requestBody = JSON.parse(event.body);
  const packageId =event.pathParameters.id;
  console.log(packageId)

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

export async function handleGetPackage(packageId: string) {
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
        let JSProgram = '';
        
        if (!items || items.length === 0) {
          return { statusCode: 404, body: JSON.stringify({ message: 'Package not found' }) };
        }



        items.forEach((item) => {
            packageVersion = item.Version.S? item.Version.S : 'No version';
            packageName = item.Name.S? item.Name.S : 'No name';
            JSProgram = item.JSProgram.S? item.JSProgram.S : '';
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

export async function handleUpdatePackage(event: LambdaEvent) {
    try {
        const requestBody = JSON.parse(event.body);
        const packageId = requestBody.metadata.ID;
        const packageName = requestBody.metadata.Name;
        let packageVersion = requestBody.metadata.Version;
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
        
        
        if (!checkResult.Items || checkResult.Items && checkResult.Items.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ message: "Package not found" }) };
        }

        const versionisValid = await checkValidVersion(packageName, packageVersion);
        

        if(!versionisValid)
        {
            return { statusCode: 400, body: JSON.stringify({ message: "Version already exists" }) };
        }


        if(content){
            if (checkResult.Items.some(item => item.URL.S && item.URL.S.length > 0)) { //check if the package has a URL(was not uploaded by content)
            return { statusCode: 400, body: JSON.stringify({ message: `Package cannot be uploaded by content. It was uploaded with url` }) };
            }
          let major: number, minor: number, patch: number;
          [major, minor, patch] = packageVersion.split('.').map(Number);
          const mostRecentVersion  = await getMostRecentVersion(packageName, major, minor);
          console.log("most recent version", mostRecentVersion)
          if (await checkValidVersionContent(packageVersion, mostRecentVersion) === false) {  //check for invalid patch
            return { statusCode: 400, body: JSON.stringify({ message: "Invalid version" }) };
          }
        }
        if(url){
          if(!checkResult.Items.some(item => item.URL.S && item.URL.S.length > 0)) { //check if the package has a URL(was not uploaded by content)
            return { statusCode: 400, body: JSON.stringify({ message: "Invalid request, uploading by url but package was uploaded by content" }) };
          }
        }

        if(debloat){
          flag = 0
          const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'package-'));
          const packagedebloatName = packageName;
          const version = packageVersion;
          let packagePath = ''
          let tempversion = ''
          let tempname = ''
          if(url && url.includes('npmjs.com')) {
            try{
            [packagePath, tempversion, tempname] =  await downloadAndExtractNpmPackage(url, tempDir, packageName, packageVersion);}
            catch (error) {
              console.error('Error downloading and extracting package:', error);
              throw new Error('Error downloading and extracting package');
          }
        }
          else if(content){
            packagePath = await extractBase64ZipContent(content, tempDir);
          }
          else if(url && url.includes('github.com')){
            const [owner, repo]: [string, string] = parseGitHubUrl(url) as [string, string];
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
            const response0 = await axios.get(apiUrl);
            const branch = response0.data.default_branch;
            [packagePath, tempversion] = await downloadAndExtractGithubPackage(url, tempDir, owner, repo, branch);
          }
          const outputDir = path.join(tempDir, 'debloated');
      fs.mkdirSync(outputDir, { recursive: true });


      
      let entryPath = fs.existsSync(path.join(packagePath, 'package.json')) ? getEntryPoint(path.join(packagePath, 'package.json')) : [];
      for(let i = 0; i < entryPath.length; i++){
        entryPath[i] = path.join(packagePath, entryPath[i]);
      }

      if (entryPath.length === 0) {
        flag = 1
        // return {
        //   statusCode: 400,
        //   body: JSON.stringify('No entry point found'),
        // };
      }

      const updatedEntryPath: string[] = [];
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
        flag = 1
        // return {
        //   statusCode: 400,
        //   body: JSON.stringify('No entry point found'),
        // };
      }

      
      
      console.log(entryPath)
      if(flag !== 1){
        flag = 0
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
      statusCode: 200,
      body: "Package updated successfully",
    };
  }}
  if (debloat === false || flag === 1){  //not debloating or error in debloating

    if(url && url.includes('npmjs.com')){
        const [tid, tname, tversion, base64Zip] = await downloadNpm(url, JSProgram);
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
        let version  = await getVersionFromGithub(owner, repo);
        if(version !== ''){packageVersion = version;}
        console.log('Branch:', branch);
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
      if(packageVersion.length === 0){ packageVersion = '1.0.0';}
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

export async function handleDeletePackage(id:string){
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

export async function downloadAndExtractGithubPackage(githubUrl: string, destination: string, owner: string, repo: string, branch:string): Promise<any> {
  const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${branch}`;
  const tarballPath = path.join(destination, 'package.tar.gz');
  const writer = fs.createWriteStream(tarballPath);
  const downloadResponse = await axios.get(tarballUrl, { responseType: 'stream'});
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
        version = packageJson.version || '1.0.0'; // Default to 1.0.0 if version not found
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

export async function checkexistingPackage(packageName: string, packageVersion: string){
  console.log("packageversion: ", packageVersion)
  console.log("packagename: ", packageName)
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

export async function getMostRecentVersion(packageName: string, majorVersion: number, minorVersion: number): Promise<number> {
  const params = {
      TableName: TABLE_NAME,                 // Replace with your table name
      KeyConditionExpression: "#name = :name",
      ExpressionAttributeNames: { "#name": "Name"},// Query by the package name
      ExpressionAttributeValues: {
          ":name": { S: packageName },       // The name you're querying for
      },
      ProjectionExpression: "Version"     // Only retrieve the version attribute
  };

  try {
      const result = await dynamoDBclient.send(new QueryCommand(params));
      console.log("Query result:", result);

      if (result.Items && result.Items.length > 0) {
        console.log(result.Items[0].Version);
      } else {
        console.log("No items found");
      }
      if (result.Items && result.Items.length > 0) {
          // Extract versionInt values from each item
            const versionInts = result.Items
            .filter(item => {
              if (item.Version && item.Version.S) {
                const [major, minor, patch] = item.Version.S.split('.').map(Number);
                console.log("major: ", major, "minor: ", minor)
                return major === majorVersion && minor === minorVersion;
              }
              return false;
            })
            .map(item => versionInt(item.Version.S || ''));
            console.log("versionInts: ", versionInts)
          return Math.max(...versionInts);
      } else {
          console.log("No versions found for this package.");
          return 0;
      }
  } catch (error) {
      console.error("Error querying DynamoDB:", error);
      return 0;
  }
}

export async function checkValidVersionContent(version:string, mostRecentVersion:number) {
  console.log("most Recent version", mostRecentVersion)
  const [major, minor, patch] = version.split('.').map(Number);
  const mostRecentMajor: number = Math.floor((mostRecentVersion) / 1000000);
  const mostRecentMinor = Math.floor((mostRecentVersion % 1000000) / 1000);
  const mostRecentPatch = mostRecentVersion % 1000;


  // If the major and minor versions are the same, check for sequential patch updates
  if (major === mostRecentMajor && minor === mostRecentMinor) {
    return patch > mostRecentPatch;
  }

  // Otherwise, the incoming version is valid
  return true;
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
      console.error('Invalid URL:', error);
      return null;
  }
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

  export async function uploadDB(packageId: string, packageName: string, packageVersion: string, JSProgram: string, url: string){
    console.log("packageversion: ", packageVersion)
    if(packageVersion.includes('v')){
      packageVersion = packageVersion.replace('v', '');
    }
    const item = {
      ID: { S: packageId },
      Name: { S: packageName },
      Version: { S: packageVersion },
      VersionInt: { N: versionInt(packageVersion).toString() },
      JSProgram: { S: JSProgram },
      CreatedAt: { S: new Date().toISOString() },
      URL: { S: url || '' },
    };
    console.log("item: ", item)
    await dynamoDBclient.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: item
    }));
  
  }
  export function versionInt(version: string): number{
    const [major, minor, patch] = version.split('.').map(Number);
    return major * 1000000 + minor * 1000 + patch;
  }
  export async function downloadAndExtractNpmPackage(npmUrl: string, destination: string, packageName: string, packageVersion:string): Promise<any> {
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
  export async function extractBase64ZipContent(base64Content: string, destination: string): Promise<string> {
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
    const fileStream = fs.createReadStream(filePath);
    await s3.putObject({
      Bucket: bucketName,
      Key: key,
      Body: fileStream,
      ContentType: 'application/zip',
  })
  
  }

  export async function checkValidVersion(packageName: string, version: string): Promise<boolean> {
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

  export async function downloadNpm(npmUrl:string, JSProgram: string){
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
      console.log(archive)
  
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
      await uploadDB(generatePackageId(packageName, version), packageName, version, JSProgram, npmUrl);
      let id = generatePackageId(packageName, version);
      return [packageName, version, id, base64content];
    } catch (error) {
      console.log('Error downloading npm package:', error);
      throw error;
    }
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
              return '';
          }
      } else {
          throw error; // Re-throw for other errors
      }
  }
  }
