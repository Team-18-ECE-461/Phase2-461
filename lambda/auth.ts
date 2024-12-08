import { 
    CognitoUserPool, 
    CognitoUser, 
    AuthenticationDetails 
  } from 'amazon-cognito-identity-js';
  
  import { 
    CognitoIdentityProviderClient, 
    AdminGetUserCommand, 
    AdminGetUserCommandInput, 
    AdminGetUserCommandOutput 
  } from '@aws-sdk/client-cognito-identity-provider';
  
  import * as jwt from 'jsonwebtoken';
  
  interface LoginRequest {
    username: string;
    password: string;
  }
  
  interface AuthenticationResponse {
    token: string;
    userId: string;
    expiresIn: number;
  }
  
  class AuthenticationService {
    private userPool: CognitoUserPool;
    private cognitoIdentityProvider: CognitoIdentityProviderClient;
    constructor() {
      const poolData = {
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        ClientId: process.env.COGNITO_CLIENT_ID!
      };
  
      this.userPool = new CognitoUserPool(poolData);
      this.cognitoIdentityProvider = new CognitoIdentityProviderClient({});
    }
  
    /**
     * Authenticate user and generate token
     * @param loginRequest User login credentials
     * @returns Promise with authentication response
     */
    async authenticate(loginRequest: LoginRequest): Promise<AuthenticationResponse> {
      const authenticationDetails = new AuthenticationDetails({
        Username: loginRequest.username,
        Password: loginRequest.password
      });
  
      const userData = {
        Username: loginRequest.username,
        Pool: this.userPool
      };
  
      const cognitoUser = new CognitoUser(userData);
  
      return new Promise((resolve, reject) => {
        cognitoUser.authenticateUser(authenticationDetails, {
          onSuccess: (result: any) => {
            // Generate custom JWT token
            const token = this.generateCustomToken(
              loginRequest.username, 
              result.getAccessToken().getJwtToken()
            );
  
            // Decode access token to get user ID
            const decodedToken = jwt.decode(result.getAccessToken().getJwtToken()) as { sub?: string };
  
            resolve({
              token,
              userId: decodedToken?.sub || '',
              expiresIn: 3600 // 1 hour expiration
            });
          },
          onFailure: (err: any) => {
            reject(this.handleAuthenticationError(err));
          }
        });
      });
    }
  
    /**
     * Generate a custom JWT token
     * @param username User's username
     * @param cognitoToken Cognito access token
     * @returns Custom JWT token
     */
    private generateCustomToken(username: string, cognitoToken: string): string {
      const payload = {
        sub: username,
        cognitoToken, // Include Cognito token for additional validation if needed
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiration
      };
  
      return jwt.sign(
        payload, 
        process.env.JWT_SECRET!, 
        { algorithm: 'HS256' }
      );
    }
  
    /**
     * Handle authentication errors
     * @param err Authentication error
     * @returns Standardized error
     */
    private handleAuthenticationError(err: any): Error {
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
  export const lambdaHandler = async (event: any) => {
    try {
      // Parse request body
       let requestbody =  JSON.parse(event.body);
       const username = requestbody.User.name;
       const password = requestbody.Secret.password;

  
      // Validate input
      if (!username || !password) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Username and password are required' })
        };
      }
  
      // Authenticate user
      const authService = new AuthenticationService();
      const authResult = await authService.authenticate({ username, password });
  
      return {
        statusCode: 200,
        body: JSON.stringify(authResult)
      };
    } catch (error) {
      console.error('Authentication error:', error);
  
      return {
        statusCode: 401,
        body: JSON.stringify({ 
          message: error instanceof Error ? error.message : 'Authentication failed' 
        })
      };
    }
  };
  
  // Example request body
  const loginRequestExample = {
    username: 'johndoe',
    password: 'SecurePassword123!'
  };