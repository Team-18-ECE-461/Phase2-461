const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
let userPoolId = process.env.COGNITO_USER_POOL_ID;

const client = jwksClient({
  jwksUri: `https://cognito-idp.<region>.amazonaws.com/${userPoolId}/.well-known/jwks.json`, // Replace with your Cognito JWKS URI
});

/**
 * Get signing key from JWKS
 * @param {string} kid - Key ID from the token header
 * @returns {Promise<string>} - Public key
 */
const getSigningKey = (kid: any) => {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err:any, key:any) => {
      if (err) {
        reject(err);
      } else {
        resolve(key.getPublicKey());
      }
    });
  });
};

/**
 * Generate IAM policy
 * @param principalId - Identifier for the user
 * @param effect - "Allow" or "Deny"
 * @param resource - API Gateway method ARN
 * @returns IAM policy
 */
const generatePolicy = (principalId: string, effect: "Allow" | "Deny", resource: string) => {
  const policyDocument = {
    Version: "2012-10-17",
    Statement: [
      {
        Action: "execute-api:Invoke",
        Effect: effect,
        Resource: resource,
      },
    ],
  };

  return {
    principalId,
    policyDocument,
  };
};

/**
 * Lambda Authorizer Handler
 * @param {object} event - API Gateway Lambda Authorizer event
 * @returns {object} - IAM policy or error
 */
exports.handler = async (event:any) => {
  console.log("Event:", event);

  const token = event.headers.Authorization || event.headers.authorization;

  if (!token || !token.toLowerCase().startsWith("bearer ")) {
    throw new Error("Unauthorized: Missing or invalid Authorization header");
  }

  const rawToken = token.split(" ")[1]; // Extract token after "Bearer "

  try {
    // Decode the token to get the header and kid
    const decodedToken = jwt.decode(rawToken, { complete: true });

    if (!decodedToken || !decodedToken.header || !decodedToken.payload) {
      throw new Error("Unauthorized: Invalid token format");
    }

    const kid = decodedToken.header.kid; // Key ID from token header
    const signingKey = await getSigningKey(kid); // Retrieve signing key

    // Verify the token
    const verifiedToken = jwt.verify(rawToken, signingKey, {
      audience: process.env.COGNITO_APP_CLIENT_ID, // Replace with your Cognito App Client ID
      issuer: `https://cognito-idp.<region>.amazonaws.com/${userPoolId}`, // Replace with your Cognito User Pool Issuer
    });

    console.log("Verified Token:", verifiedToken);

    // Return an Allow policy for a valid token
    return generatePolicy(verifiedToken.sub, "Allow", event.methodArn);
  } catch (error:any) {
    console.error("Token validation error:", error.message);

    // Return a Deny policy for invalid tokens
    return generatePolicy("unauthorized", "Deny", event.methodArn);
  }
};