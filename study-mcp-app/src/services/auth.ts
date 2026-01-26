import * as SecureStore from 'expo-secure-store';
import {
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { userPool, cognitoConfig } from '../config/cognito';
import { User } from '../types';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';

export class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async getToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  }

  async setToken(token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      // Token will be added to requests via the interceptor in api.ts
      // No need to set it directly here to avoid circular dependency
    } catch (error) {
      console.error('Error setting token:', error);
    }
  }

  async getUser(): Promise<User | null> {
    if (this.currentUser) {
      return this.currentUser;
    }

    try {
      const userData = await SecureStore.getItemAsync(USER_KEY);
      if (userData) {
        this.currentUser = JSON.parse(userData);
        return this.currentUser;
      }
    } catch (error) {
      console.error('Error getting user:', error);
    }
    return null;
  }

  async setUser(user: User): Promise<void> {
    try {
      this.currentUser = user;
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    } catch (error) {
      console.error('Error setting user:', error);
    }
  }

  /**
   * Compute SECRET_HASH for Cognito requests when client secret is configured
   * SECRET_HASH = HMAC-SHA256(username + clientId, clientSecret) base64 encoded
   * 
   * AWS Cognito requires:
   * - message = username + clientId (as UTF-8 string)
   * - key = clientSecret (as UTF-8 string)
   * - HMAC-SHA256(message, key) then base64 encode
   */
  private computeSecretHash(username: string): string | undefined {
    if (!cognitoConfig.clientSecret) {
      return undefined;
    }

    try {
      const crypto = require('crypto-js');
      const message = username + cognitoConfig.clientId;
      
      // Compute HMAC-SHA256
      // Note: crypto-js handles UTF-8 encoding automatically
      const hmac = crypto.HmacSHA256(message, cognitoConfig.clientSecret);
      
      // Convert to base64 string
      const secretHash = crypto.enc.Base64.stringify(hmac);
      
      if (__DEV__) {
        console.log('[Auth] Computed SECRET_HASH for username:', username);
      }
      
      return secretHash;
    } catch (error) {
      console.error('Error computing secret hash:', error);
      return undefined;
    }
  }

  /**
   * Parse JWT token to extract user information
   * Uses base64 decoding compatible with React Native
   */
  private parseJWT(token: string): User | null {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      
      // Use Buffer or atob depending on environment
      let decoded: string;
      if (typeof atob !== 'undefined') {
        decoded = atob(base64);
      } else {
        // React Native fallback - use Buffer if available
        const Buffer = require('buffer').Buffer;
        decoded = Buffer.from(base64, 'base64').toString('utf-8');
      }
      
      const jsonPayload = decodeURIComponent(
        decoded
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);
      
      // Helper to check if a string is a UUID
      const isUUID = (str: string | undefined): boolean => {
        if (!str) return false;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
      };
      
      // Try to get a proper name, avoiding UUIDs
      let name: string | undefined;
      if (payload.name && !isUUID(payload.name)) {
        name = payload.name;
      } else if (payload.given_name || payload.family_name) {
        name = [payload.given_name, payload.family_name].filter(Boolean).join(' ');
      } else if (payload.nickname && !isUUID(payload.nickname)) {
        name = payload.nickname;
      } else if (payload['cognito:username'] && !isUUID(payload['cognito:username'])) {
        name = payload['cognito:username'];
      } else if (payload.email) {
        // Use email as fallback, but we'll format it nicely in the UI
        name = undefined;
      }
      
      return {
        id: payload.sub,
        email: payload.email,
        name: name,
      };
    } catch (error) {
      console.error('Error parsing JWT:', error);
      return null;
    }
  }

  /**
   * Authenticate user with email and password
   */
  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    // If client secret is configured, we need to make a direct API call
    // because amazon-cognito-identity-js doesn't properly support SECRET_HASH in AuthenticationDetails
    if (cognitoConfig.clientSecret) {
      return new Promise(async (resolve, reject) => {
        try {
          const secretHash = this.computeSecretHash(email);

          if (__DEV__) {
            console.log('[Auth] Login with SECRET_HASH - ClientId:', cognitoConfig.clientId);
            console.log('[Auth] Login with SECRET_HASH - Username:', email);
          }

          // Make direct API call to Cognito with SECRET_HASH
          const response = await fetch(
            `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`,
            {
              method: 'POST',
              headers: {
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
                'Content-Type': 'application/x-amz-json-1.1',
              },
              body: JSON.stringify({
                AuthFlow: 'USER_PASSWORD_AUTH',
                ClientId: cognitoConfig.clientId,
                AuthParameters: {
                  USERNAME: email,
                  PASSWORD: password,
                  SECRET_HASH: secretHash,
                },
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            // If USER_PASSWORD_AUTH is not enabled, fall back to library method (uses SRP)
            if (data.__type === 'InvalidParameterException' && 
                data.message?.includes('USER_PASSWORD_AUTH flow not enabled')) {
              if (__DEV__) {
                console.log('[Auth] USER_PASSWORD_AUTH not enabled, falling back to SRP flow');
              }
              // Fall through to library method below
              // But we can't easily do that from here, so we'll reject with a specific error
              reject(new Error('USER_PASSWORD_AUTH_NOT_ENABLED'));
              return;
            }
            
            let errorMessage = 'Authentication failed';
            if (data.__type === 'NotAuthorizedException') {
              errorMessage = 'Incorrect email or password';
            } else if (data.__type === 'UserNotConfirmedException') {
              errorMessage = 'Please verify your email address';
            } else if (data.message) {
              errorMessage = data.message;
            }
            
            if (__DEV__) {
              console.error('[Auth] Login error:', data);
            }
            
            reject(new Error(errorMessage));
            return;
          }

          // Extract tokens from response
          const idToken = data.AuthenticationResult?.IdToken;
          const accessToken = data.AuthenticationResult?.AccessToken;
          if (!idToken) {
            reject(new Error('No ID token received from authentication'));
            return;
          }

          let user = this.parseJWT(idToken);
          if (!user) {
            reject(new Error('Failed to parse user information from token'));
            return;
          }

          // Fetch user attributes from Cognito to get display name
          if (accessToken) {
            try {
              const secretHash = this.computeSecretHash(email);
              const getUserResponse = await fetch(
                `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`,
                {
                  method: 'POST',
                  headers: {
                    'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser',
                    'Content-Type': 'application/x-amz-json-1.1',
                  },
                  body: JSON.stringify({
                    AccessToken: accessToken,
                    ...(secretHash && { SecretHash: secretHash }),
                  }),
                }
              );

              if (getUserResponse.ok) {
                const userData = await getUserResponse.json();
                
                // Helper to check if a string is a UUID
                const isUUID = (str: string | undefined): boolean => {
                  if (!str) return false;
                  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                  return uuidRegex.test(str);
                };

                // Extract display name from user attributes
                let displayName: string | undefined;
                if (userData.UserAttributes) {
                  const nameAttr = userData.UserAttributes.find((attr: any) => attr.Name === 'name');
                  if (nameAttr?.Value && !isUUID(nameAttr.Value)) {
                    displayName = nameAttr.Value;
                  }
                  
                  if (!displayName) {
                    const givenName = userData.UserAttributes.find((attr: any) => attr.Name === 'given_name')?.Value;
                    const familyName = userData.UserAttributes.find((attr: any) => attr.Name === 'family_name')?.Value;
                    if (givenName || familyName) {
                      displayName = [givenName, familyName].filter(Boolean).join(' ');
                    }
                  }
                  
                  if (!displayName) {
                    const nickname = userData.UserAttributes.find((attr: any) => attr.Name === 'nickname')?.Value;
                    if (nickname && !isUUID(nickname)) {
                      displayName = nickname;
                    }
                  }
                }

                // Update user with display name if found
                if (displayName && user) {
                  user.name = displayName;
                }
              }
            } catch (attrError) {
              console.warn('[Auth] Error fetching user attributes:', attrError);
              // Continue without attributes
            }
          }

          await this.setToken(idToken);
          await this.setUser(user);

          resolve({ user, token: idToken });
        } catch (error: any) {
          if (__DEV__) {
            console.error('[Auth] Login exception:', error);
          }
          reject(new Error(error.message || 'Authentication failed'));
        }
      });
    }

    // Fallback to library method if no client secret
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: async (session: CognitoUserSession) => {
          try {
            const idToken = session.getIdToken().getJwtToken();
            let user = this.parseJWT(idToken);

            if (!user) {
              reject(new Error('Failed to parse user information from token'));
              return;
            }

            // Fetch user attributes from Cognito to get display name
            try {
              await new Promise<void>((resolveAttr, rejectAttr) => {
                cognitoUser.getUserAttributes((err, attributes) => {
                  if (err) {
                    console.warn('[Auth] Failed to fetch user attributes:', err);
                    resolveAttr(); // Continue without attributes
                    return;
                  }

                  if (attributes && user) {
                    // Helper to check if a string is a UUID
                    const isUUID = (str: string | undefined): boolean => {
                      if (!str) return false;
                      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                      return uuidRegex.test(str);
                    };

                    // Find display name from attributes
                    let displayName: string | undefined;
                    
                    // Try name attribute first
                    const nameAttr = attributes.find(attr => attr.getName() === 'name');
                    if (nameAttr && !isUUID(nameAttr.getValue())) {
                      displayName = nameAttr.getValue();
                    }
                    
                    // Try given_name + family_name
                    if (!displayName) {
                      const givenName = attributes.find(attr => attr.getName() === 'given_name')?.getValue();
                      const familyName = attributes.find(attr => attr.getName() === 'family_name')?.getValue();
                      if (givenName || familyName) {
                        displayName = [givenName, familyName].filter(Boolean).join(' ');
                      }
                    }
                    
                    // Try nickname
                    if (!displayName) {
                      const nickname = attributes.find(attr => attr.getName() === 'nickname')?.getValue();
                      if (nickname && !isUUID(nickname)) {
                        displayName = nickname;
                      }
                    }

                    // Update user with display name if found
                    if (displayName) {
                      user.name = displayName;
                    }
                  }
                  
                  resolveAttr();
                });
              });
            } catch (attrError) {
              console.warn('[Auth] Error fetching user attributes:', attrError);
              // Continue without attributes
            }

            await this.setToken(idToken);
            await this.setUser(user);

            resolve({ user, token: idToken });
          } catch (error: any) {
            reject(new Error(error.message || 'Failed to process authentication'));
          }
        },
        onFailure: (err: any) => {
          let errorMessage = 'Authentication failed';
          if (err?.code === 'NotAuthorizedException') {
            errorMessage = 'Incorrect email or password';
          } else if (err?.code === 'UserNotConfirmedException') {
            errorMessage = 'Please verify your email address';
          } else if (err?.message) {
            errorMessage = err.message;
          }
          reject(new Error(errorMessage));
        },
        newPasswordRequired: (userAttributes: any, requiredAttributes: any) => {
          // Handle new password required (first time login after admin creates user)
          reject(new Error('New password required. Please contact support.'));
        },
      });
    });
  }

  /**
   * Register a new user
   */
  async signUp(email: string, password: string, name?: string): Promise<{ user: User; token: string }> {
    return new Promise((resolve, reject) => {
      const secretHash = this.computeSecretHash(email);
      
      // If client secret is configured, we need to make a direct API call
      // because amazon-cognito-identity-js doesn't support SECRET_HASH in signUp
      if (secretHash && cognitoConfig.clientSecret) {
        (async () => {
          try {
            if (__DEV__) {
              console.log('[Auth] SignUp with SECRET_HASH - ClientId:', cognitoConfig.clientId);
              console.log('[Auth] SignUp with SECRET_HASH - Username:', email);
            }

            // Make direct API call to Cognito with SECRET_HASH
            const response = await fetch(
              `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`,
              {
                method: 'POST',
                headers: {
                  'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
                  'Content-Type': 'application/x-amz-json-1.1',
                },
                body: JSON.stringify({
                  ClientId: cognitoConfig.clientId,
                  Username: email,
                  Password: password,
                  SecretHash: secretHash,
                  UserAttributes: [
                    {
                      Name: 'email',
                      Value: email,
                    },
                    ...(name ? [{
                      Name: 'name',
                      Value: name,
                    }] : []),
                  ],
                }),
              }
            );

            const data = await response.json();

            if (!response.ok) {
              let errorMessage = 'Registration failed';
              if (data.__type === 'UsernameExistsException') {
                errorMessage = 'An account with this email already exists';
              } else if (data.__type === 'InvalidPasswordException') {
                errorMessage = 'Password does not meet requirements';
              } else if (data.__type === 'NotAuthorizedException' && data.message?.includes('secret hash')) {
                errorMessage = 'Invalid client secret. Please check EXPO_PUBLIC_COGNITO_CLIENT_SECRET configuration.';
              } else if (data.message) {
                errorMessage = data.message;
              }
              
              if (__DEV__) {
                console.error('[Auth] SignUp error:', data);
              }
              
              reject(new Error(errorMessage));
              return;
            }

            // If user is automatically confirmed, authenticate them
            if (data.UserConfirmed) {
              this.login(email, password)
                .then(resolve)
                .catch(reject);
            } else {
              // User needs to verify email - throw error that will trigger navigation to verification screen
              reject(
                new Error(
                  'Please check your email to verify your account before signing in.'
                )
              );
            }
          } catch (error: any) {
            if (__DEV__) {
              console.error('[Auth] SignUp exception:', error);
            }
            reject(new Error(error.message || 'Registration failed'));
          }
        })();
        return;
      }

      // Fallback to library method if no client secret
      const attributeList = [
        new CognitoUserAttribute({
          Name: 'email',
          Value: email,
        }),
        ...(name ? [new CognitoUserAttribute({
          Name: 'name',
          Value: name,
        })] : []),
      ];

      userPool.signUp(email, password, attributeList, [], (err: any, result) => {
        if (err) {
          let errorMessage = 'Registration failed';
          if (err?.code === 'UsernameExistsException') {
            errorMessage = 'An account with this email already exists';
          } else if (err?.code === 'InvalidPasswordException') {
            errorMessage = 'Password does not meet requirements';
          } else if (err?.message) {
            errorMessage = err.message;
          }
          reject(new Error(errorMessage));
          return;
        }

        if (!result) {
          reject(new Error('Registration failed - no result returned'));
          return;
        }

        const cognitoUser = result.user;

        // If user is automatically confirmed, authenticate them
        if (result.userConfirmed) {
          // Auto-login after successful signup
          this.login(email, password)
            .then(resolve)
            .catch(reject);
        } else {
          // User needs to confirm email - throw error that will trigger navigation to verification screen
          reject(
            new Error(
              'Please check your email to verify your account before signing in.'
            )
          );
        }
      });
    });
  }

  /**
   * Confirm user's email with verification code
   */
  async confirmSignUp(email: string, code: string): Promise<void> {
    // If client secret is configured, we need to make a direct API call
    if (cognitoConfig.clientSecret) {
      return new Promise(async (resolve, reject) => {
        try {
          const secretHash = this.computeSecretHash(email);

          const response = await fetch(
            `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`,
            {
              method: 'POST',
              headers: {
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmSignUp',
                'Content-Type': 'application/x-amz-json-1.1',
              },
              body: JSON.stringify({
                ClientId: cognitoConfig.clientId,
                Username: email,
                ConfirmationCode: code,
                SecretHash: secretHash,
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            let errorMessage = 'Verification failed';
            if (data.__type === 'CodeMismatchException') {
              errorMessage = 'Invalid verification code';
            } else if (data.__type === 'ExpiredCodeException') {
              errorMessage = 'Verification code has expired';
            } else if (data.message) {
              errorMessage = data.message;
            }
            reject(new Error(errorMessage));
            return;
          }

          resolve();
        } catch (error: any) {
          reject(new Error(error.message || 'Verification failed'));
        }
      });
    }

    // Fallback to library method if no client secret
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmRegistration(code, true, (err: any) => {
        if (err) {
          let errorMessage = 'Verification failed';
          if (err.code === 'CodeMismatchException') {
            errorMessage = 'Invalid verification code';
          } else if (err.code === 'ExpiredCodeException') {
            errorMessage = 'Verification code has expired';
          } else if (err.message) {
            errorMessage = err.message;
          }
          reject(new Error(errorMessage));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Resend verification code
   */
  async resendConfirmationCode(email: string): Promise<void> {
    // If client secret is configured, we need to make a direct API call
    if (cognitoConfig.clientSecret) {
      return new Promise(async (resolve, reject) => {
        try {
          const secretHash = this.computeSecretHash(email);

          const response = await fetch(
            `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/`,
            {
              method: 'POST',
              headers: {
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.ResendConfirmationCode',
                'Content-Type': 'application/x-amz-json-1.1',
              },
              body: JSON.stringify({
                ClientId: cognitoConfig.clientId,
                Username: email,
                SecretHash: secretHash,
              }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            reject(new Error(data.message || 'Failed to resend verification code'));
            return;
          }

          resolve();
        } catch (error: any) {
          reject(new Error(error.message || 'Failed to resend verification code'));
        }
      });
    }

    // Fallback to library method if no client secret
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.resendConfirmationCode((err: any) => {
        if (err) {
          reject(new Error(err.message || 'Failed to resend verification code'));
          return;
        }
        resolve();
      });
    });
  }

  async logout(): Promise<void> {
    try {
      // Get current user email to sign out from Cognito
      const user = await this.getUser();
      if (user?.email) {
        const cognitoUser = new CognitoUser({
          Username: user.email,
          Pool: userPool,
        });
        cognitoUser.signOut();
      }

      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
      this.currentUser = null;
      // Token removal from API client will be handled by the interceptor
    } catch (error) {
      console.error('Error logging out:', error);
      // Still clear local storage even if Cognito signout fails
      try {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(USER_KEY);
        this.currentUser = null;
      } catch (e) {
        console.error('Error clearing local storage:', e);
      }
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }

  // Initialize auth state on app start
  async initialize(): Promise<void> {
    const token = await this.getToken();
    if (token) {
      // Token will be added to requests via the interceptor
      await this.getUser();
    }
  }
}

export const authService = AuthService.getInstance();
