import { CognitoIdentityProviderClient, RespondToAuthChallengeCommand, InitiateAuthCommand, AuthFlowType } from "@aws-sdk/client-cognito-identity-provider";
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
     * Authenticate user and return Cognito tokens directly
     * @param loginRequest User login credentials
     * @returns Promise with authentication response
     */
    async authenticate(loginRequest: { username: string; password: string }): Promise<any> {
        const { username, password } = loginRequest;

        const params = {
            AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
            ClientId: process.env.COGNITO_CLIENT_ID,
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password,
                SECRET_HASH: this.generateSecretHash(username),
            },
        };

        try {
            const command = new InitiateAuthCommand(params);
            const response = await this.cognitoIdentityProvider.send(command);

            // Handle NEW_PASSWORD_REQUIRED challenge if present
            if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
                if (!response.Session) {
                    throw new Error('Session is missing from NEW_PASSWORD_REQUIRED challenge.');
                }

                const challengeParams = {
                    ClientId: process.env.COGNITO_CLIENT_ID,
                    ChallengeName: 'NEW_PASSWORD_REQUIRED' as const,
                    Session: response.Session,
                    ChallengeResponses: {
                        USERNAME: username,
                        NEW_PASSWORD: password,
                        SECRET_HASH: this.generateSecretHash(username),
                    },
                };

                const respondToChallengeCommand = new RespondToAuthChallengeCommand(challengeParams);
                const challengeResponse = await this.cognitoIdentityProvider.send(respondToChallengeCommand);

                if (challengeResponse.AuthenticationResult) {
                    return {
                        //accessToken: challengeResponse.AuthenticationResult.AccessToken,
                        idToken: challengeResponse.AuthenticationResult.IdToken,
                        //refreshToken: challengeResponse.AuthenticationResult.RefreshToken,
                        //expiresIn: challengeResponse.AuthenticationResult.ExpiresIn,
                        //tokenType: challengeResponse.AuthenticationResult.TokenType,
                    };
                } else {
                    throw new Error('AuthenticationResult is undefined after NEW_PASSWORD_REQUIRED challenge response.');
                }
            }

            // Normal authentication flow
            if (response.AuthenticationResult) {
                return {
                    //accessToken: response.AuthenticationResult.AccessToken,
                    idToken: response.AuthenticationResult.IdToken,
                    //refreshToken: response.AuthenticationResult.RefreshToken,
                    //expiresIn: response.AuthenticationResult.ExpiresIn,
                    //tokenType: response.AuthenticationResult.TokenType,
                };
            } else {
                throw new Error('AuthenticationResult is undefined.');
            }

        } catch (err) {
            console.error(err);
            throw this.handleAuthenticationError(err);
        }
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
        let password = requestBody.Secret?.password;

        // Simple SQL injection keyword checks and replacement
        if (password.includes("DROP") || password.includes("DELETE") || password.includes("UPDATE") || 
            password.includes("INSERT") || password.includes("SELECT") || password.includes("TRUNCATE") ||
            password.includes("ALTER") || password.includes("CREATE") || password.includes("RENAME") || 
            password.includes("REVOKE") || password.includes("GRANT") || password.includes("COMMIT") || 
            password.includes("ROLLBACK") || password.includes("SAVEPOINT") || password.includes("SET TRANSACTION") ||
            password.includes("SET CONSTRAINTS{") || password.includes("SET SESSION") || 
            password.includes("SET TIME ZONE") || password.includes("SET ROLE") || password.includes("SET SESSION")) {
            password = "Safepassword#1234"
        }

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
            headers: {
                'Content-Type': 'text/plain',
            },
            body: `"${authResult.idToken}"`,
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
