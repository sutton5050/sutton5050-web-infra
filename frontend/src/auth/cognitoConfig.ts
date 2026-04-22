import type { UserManagerSettings } from 'oidc-client-ts';
import { WebStorageStateStore } from 'oidc-client-ts';

const REGION = import.meta.env.VITE_COGNITO_REGION || 'eu-west-2';
const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
const APP_CLIENT_ID = import.meta.env.VITE_COGNITO_APP_CLIENT_ID || '';
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || '';
const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN || 'localhost:5173';

const isLocal = window.location.hostname === 'localhost';
const baseUrl = isLocal ? 'http://localhost:5173' : `https://${APP_DOMAIN}`;

if (!isLocal && (!COGNITO_DOMAIN || !USER_POOL_ID || !APP_CLIENT_ID)) {
  console.error('Missing required Cognito env vars: VITE_COGNITO_DOMAIN, VITE_COGNITO_USER_POOL_ID, VITE_COGNITO_APP_CLIENT_ID');
}

const authBase = COGNITO_DOMAIN ? `https://${COGNITO_DOMAIN}` : '';

export const cognitoConfig: UserManagerSettings = {
  authority: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
  client_id: APP_CLIENT_ID,
  redirect_uri: `${baseUrl}/callback`,
  post_logout_redirect_uri: baseUrl,
  response_type: 'code',
  scope: 'openid email profile',
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  // Cognito OIDC metadata overrides
  metadata: {
    issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
    authorization_endpoint: `${authBase}/oauth2/authorize`,
    token_endpoint: `${authBase}/oauth2/token`,
    end_session_endpoint: `${authBase}/logout?client_id=${APP_CLIENT_ID}&logout_uri=${encodeURIComponent(baseUrl)}`,
    userinfo_endpoint: `${authBase}/oauth2/userInfo`,
    jwks_uri: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
  },
};
