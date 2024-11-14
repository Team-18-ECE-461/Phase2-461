interface LambdaEvent {
    body: string
    queryStringParameters: any
}


export const lambdaHandler = async (event: LambdaEvent) => {
    console.log('event', event);
    return {
        statusCode: 200,
        body: event.body
    }
}