/**
 * AWS Cognito Configuration
 * 
 * Set these environment variables or update the values below:
 * - COGNITO_USER_POOL_ID: Your Cognito User Pool ID
 * - COGNITO_CLIENT_ID: Your Cognito App Client ID
 * - COGNITO_REGION: AWS region (default: us-east-1)
 */

import { CognitoUserPool, CognitoUserAttribute } from 'amazon-cognito-identity-js';

// Get configuration from environment or use defaults
const USER_POOL_ID = (process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID || '').trim();
const CLIENT_ID = (process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.EXPO_PUBLIC_COGNITO_CLIENT_SECRET || '').trim();
const REGION = (process.env.EXPO_PUBLIC_COGNITO_REGION || 'us-east-1').trim();

if (!USER_POOL_ID || !CLIENT_ID) {
  console.warn(
    '⚠️  Cognito not configured. Set EXPO_PUBLIC_COGNITO_USER_POOL_ID and EXPO_PUBLIC_COGNITO_CLIENT_ID'
  );
}

if (CLIENT_SECRET) {
  console.warn(
    '⚠️  Client secret detected. SECRET_HASH will be computed for requests.'
  );
}

// Create Cognito User Pool instance
export const userPool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
});

export const cognitoConfig = {
  userPoolId: USER_POOL_ID,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  region: REGION,
};
