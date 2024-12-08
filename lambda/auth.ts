import { CognitoIdentityProviderClient, AdminInitiateAuthCommand, AuthFlowType } from "@aws-sdk/client-cognito-identity-provider";
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

class AuthenticationService {
    private cognitoIdentityProvider: CognitoIdentityProviderClient;

    constructor() {
        this.cognitoIdentityProvider = new CognitoIdentityProviderClient({});
    }

    /**
     * Generate SECRET_HASH for Cognito authentication
     * @param username User's username
     * @returns SECRET_HASH string
     */
    generateSecretHash(username: string): string {
        const clientId = process.env.COGNITO_CLIENT_ID;
        const clientSecret = process.env.COGNITO_CLIENT_SECRET;

        if (!clientSecret) {
            throw new Error('COGNITO_CLIENT_SECRET is not defined');
        }
        const hmac = crypto.createHmac('SHA256', clientSecret);
        hmac.update(username + clientId);
        return hmac.digest('base64');
    }

    /**
     * Authenticate user and generate token
     * @param loginRequest User login credentials
     * @returns Promise with authentication response
     */
    async authenticate(loginRequest: { username: string; password: string }): Promise<any> {
        const { username, password } = loginRequest;

        // Prepare the authentication parameters for the USER_PASSWORD_AUTH flow
        const params = {
            AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
            ClientId: process.env.COGNITO_CLIENT_ID,
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password,
                SECRET_HASH: this.generateSecretHash(username), // Include SECRET_HASH
            },
        };

        try {
            // Make the authentication call using the AWS SDK
            const command = new AdminInitiateAuthCommand(params);
            const response = await this.cognitoIdentityProvider.send(command);

            // Generate a custom JWT token
            if (!response.AuthenticationResult || !response.AuthenticationResult.AccessToken) {
                throw new Error('Authentication failed: No access token received');
            }
            const token = this.generateCustomToken(username, response.AuthenticationResult.AccessToken);

            // Decode the Cognito token to get user ID
            const decodedToken = jwt.decode(response.AuthenticationResult.AccessToken);

            return {
                token,
                userId: decodedToken?.sub || '',
                expiresIn: 3600, // 1 hour expiration
            };
        } catch (err) {
            console.error(err);
            throw this.handleAuthenticationError(err);
        }
    }

    /**
     * Generate a custom JWT token
     * @param username User's username
     * @param cognitoToken Cognito access token
     * @returns Custom JWT token
     */
    generateCustomToken(username: string, cognitoToken: string): string {
        const payload = {
            sub: username,
            cognitoToken, // Include Cognito token for additional validation if needed
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
        };
        return jwt.sign(payload, process.env.JWT_SECRET as string, { algorithm: 'HS256' });
    }

    /**
     * Handle authentication errors
     * @param err Authentication error
     * @returns Standardized error
     */
    handleAuthenticationError(err: any): Error {
        console.log(err.code);
        switch (err.code) {
            case 'NotAuthorizedException':
                return new Error('Incorrect username or password');
            case 'UserNotFoundException':
                return new Error('User does not exist');
            case 'UserNotConfirmedException':
                return new Error('User is not confirmed');
            default:
                return new Error('Authentication failed');
        }
    }
}

// Lambda handler for /authenticate endpoint
export const lambdaHandler = async (event: any): Promise<any> => {
    try {
        // Parse request body
        const requestBody = JSON.parse(event.body);
        const username = requestBody.User?.name;
        const password = requestBody.Secret?.password;

        // Validate input
        if (!username || !password) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Username and password are required' }),
            };
        }

        // Authenticate user
        const authService = new AuthenticationService();
        const authResult = await authService.authenticate({ username, password });

        return {
            statusCode: 200,
            body: JSON.stringify(authResult),
        };
    } catch (error) {
        console.error('Authentication error:', error);
        return {
            statusCode: 401,
            body: JSON.stringify({
                message: error instanceof Error ? error.message : 'Authentication failed',
            }),
        };
    }
};

// Example request body
const loginRequestExample = {
    username: 'johndoe',
    password: 'SecurePassword123!',
};
