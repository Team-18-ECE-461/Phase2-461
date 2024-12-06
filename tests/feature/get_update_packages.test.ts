import { lambdaHandler } from "../../lambda/packagesubendpoints";
import { lambdaHandler as uploadHandler } from "../../lambda/upload_package";
import { S3, DynamoDB } from 'aws-sdk';
import * as JSZIP from 'jszip';
import AWS from 'aws-sdk';
AWS.config.update({ region: 'us-east-1' }); 

const s3 = new S3();
const dynamoDB = new DynamoDB.DocumentClient();

// Helper to create a mock Lambda event
interface MockEventData {
    metadata:{
        Name: string;
        Version: string;
        ID: string;
    }
    data:{
        URL?: string;
        Content?: string | null;
        Name: string;
        debloat: boolean;
        JSProgram: string;
    }
}
interface MockEventDataUpload{
    URL?: string;
    Content?: string | null;
    Name: string;
    debloat: boolean;
    JSProgram: string;
}
interface MockEventUpload {
    body: string;
    httpMethod: string;
}

interface MockEvent {
    body: string;
    httpMethod: string;
    pathParameters: { id: string };
}

const createMockEventUpdate = (data: MockEventData, httpMethod:string, id:string): MockEvent => ({
    body: JSON.stringify(data),
    httpMethod: httpMethod,
    pathParameters: { id: id }
});

const createMockEventUpload = (data: MockEventDataUpload): MockEventUpload => ({
    body: JSON.stringify(data),
    httpMethod: 'POST',
});

let id = '';
let zipContent = '';

describe('Package Update Lambda', () => {

    describe('Package Update with Content', () => {
        it('should update a package successfully', async () => {
            const zipBuffer = await new JSZIP.default().generateAsync({ type: 'nodebuffer' });
            const zip = await JSZIP.loadAsync(zipBuffer);

            zip.file('package.json', JSON.stringify({
            name: 'test-package',
            version: '1.0.0'
            }));
            zipContent = await zip.generateAsync({ type: 'base64' });

            const event1 = createMockEventUpload({
            Content: zipContent,
            Name: 'test-package',
            debloat: false,
            JSProgram: ''
            });

            const result1 = await uploadHandler(event1);
            // id = JSON.parse(result1.body).ID;
            // console.log(id)
            id = '6ff1bae15d12'
            const event = createMockEventUpdate({
                metadata:{
                    Name: 'test-package',
                    Version: '1.0.3',
                    ID: id
                },
                data:{
                    Content: zipContent,
                    Name: 'test-package',
                    debloat: false,
                    JSProgram: ''
                }
            }, 'POST', id);
            const result = await lambdaHandler(event);
            if (result) {
                console.log(result.body);
            }
            if (result) {
                expect(result.statusCode).toBe(200);
            } else {
                fail('Result is undefined');
            }
        });
        it('should not update a package successfully with debloating invalid zip', async () => {
            const event = createMockEventUpdate({
                metadata:{
                    Name: 'test-package',
                    Version: '1.0.2',
                    ID: id
                },
                data:{
                    Content: zipContent,
                    Name: 'test-package',
                    debloat: true,
                    JSProgram: ''
                }
            }, 'POST', id);
            const result = await lambdaHandler(event);
            if (result) {
                console.log(result.body);
                expect(result.statusCode).toBe(400);
            }
            else {
                fail('Result is undefined');
            }
        });
        it('should not update with URL if uploaded with Content', async () => {
            const event = createMockEventUpdate({
                metadata:{
                    Name: 'test-package',
                    Version: '1.0.0',
                    ID: id
                },
                data:{
                    URL: 'http://test.com',
                    Name: 'test-package',
                    debloat: false,
                    JSProgram: ''
                }
            }, 'POST', id);
            const result = await lambdaHandler(event);
            if (result) {
                expect(result.statusCode).toBe(400);
            }
            else {
                fail('Result is undefined');
            }
        });
        it('should not update with invalid versions', async () => {
            const event = createMockEventUpdate({
                metadata:{
                    Name: 'test-package',
                    Version: '1.0.1',
                    ID: id
                },
                data:{
                    Content: zipContent,
                    Name: 'test-package',
                    debloat: false,
                    JSProgram: ''
                }
            }, 'POST', id);
            const result = await lambdaHandler(event);
            if (result) {
                expect(result.statusCode).toBe(400);
            }
            else {
                fail('Result is undefined');
            }
        });
    });
    describe('Package Update with npm URL', () => {
       
        let id = 'cbd40baccd54'
        beforeAll(async () => {
            const event = createMockEventUpload({
                URL: 'https://www.npmjs.com/package/minify',
                Name: 'minify',
                debloat: false,
                JSProgram: ''
            });
            const result = await uploadHandler(event);
            
        });

        it('should update a package successfully', async () => {
            const event = createMockEventUpdate({
                metadata:{
                    Name: 'minify',
                    Version: '',
                    ID: id
                },
                data:{
                    URL: 'https://www.npmjs.com/package/minify/v/11.4.1',
                    Name: 'minify',
                    debloat: false,
                    JSProgram: ''
                }
            }, 'POST', id);
            const result = await lambdaHandler(event);
            if(result){
                console.log(result.body)
                expect(result.statusCode).toBe(200);
            }
            else {
                fail('Result is undefined');
            }
            
        });
        it ('should update npm URL successfully with debloating', async () => {
            const event = createMockEventUpdate({
                metadata:{
                    Name: 'minify',
                    Version: '11.4.0',
                    ID: id
                },
                data:{
                    URL: 'https://www.npmjs.com/package/minify/v/11.4.0',
                    Name: 'minify',
                    debloat: true,
                    JSProgram: ''
                }
            }, 'POST', id);
            const result = await lambdaHandler(event);
            if(result){
                console.log(result.body)
                expect(result.statusCode).toBe(200);
            }
            else {
                fail('Result is undefined');
            }
          
        });

        it('should not update with Content if uploaded with URL', async () => {
            const event = createMockEventUpdate({
                metadata:{
                    Name: 'minify',
                    Version: '',
                    ID: id
                },
                data:{
                    Content: zipContent,
                    Name: 'minify',
                    debloat: false,
                    JSProgram: ''
                }
            }, 'POST', id);
        
            const result = await lambdaHandler(event);
            if(result){
                console.log(result.body)
                expect(result.statusCode).toBe(400);
            }
            else {
                fail('Result is undefined');
            }
        });
    });
    describe('Package Update with github URL', () => {
        let id = 'cbd40baccd54'
        it('should update a package successfully', async () => {
        const event = createMockEventUpdate({
                metadata:{
                    Name: 'minify',
                    Version: '',
                    ID: id
                },
                data:{
                    URL: 'https://github.com/tdewolff/minify',
                    Name: 'minify',
                    debloat: false,
                    JSProgram: ''
                }
            }, 'POST', id);
        const result = await lambdaHandler(event);
        if(result){
            console.log(result.body)
            expect(result.statusCode).toBe(200);
        }
        else {
            fail('Result is undefined');
        }

       });
        it ('should update git URL successfully with debloating', async () => {
        const event = createMockEventUpdate({
                metadata:{
                    Name: 'minify',
                    Version: '12.13.12',
                    ID: id
                },
                data:{
                    URL: 'https://github.com/lodash/lodash',
                    Name: 'minify',
                    debloat: true,
                    JSProgram: ''
                }
            }, 'POST', id);
        const result = await lambdaHandler(event);
        if(result){
            console.log(result.body)
            expect(result.statusCode).toBe(200);
        }
        else {
            fail('Result is undefined');
        }
      
        });
       it('should not update with Content if uploaded with URL', async () => {
        let id = 'cbd40baccd54'
        const event = createMockEventUpdate({
                metadata:{
                    Name: 'minify',
                    Version: '',
                    ID: id
                },
                data:{
                    Content: zipContent,
                    Name: 'minify',
                    debloat: false,
                    JSProgram: ''
                }
            }, 'POST', id);
       });
    });
});

describe('Package Get Lambda', () => {


    it('should get a package successfully', async () => {
        const event = {
            body: JSON.stringify({}),
            httpMethod: 'GET',
            pathParameters: { id: 'cbd40baccd54' }
        };
        const result = await lambdaHandler(event);
        if(result){
            console.log(result.body)
            expect(result.statusCode).toBe(200);
        }
        else {
            fail('Result is undefined');
        }
    });
    it('should not get a package successfully with invalid ID', async () => {
        const event = {
            body: JSON.stringify({}),
            httpMethod: 'GET',
            pathParameters: { id: 'invalid' }
        };
        const result = await lambdaHandler(event);
        if(result){
            console.log(result.body)
            expect(result.statusCode).toBe(404);
        }
        else {
            fail('Result is undefined');
        }
    });
});
 







