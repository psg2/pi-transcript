/**
 * Lambda@Edge Viewer Request function for Google OAuth authentication.
 *
 * Flow:
 * 1. Check for a valid JWT session cookie
 * 2. If valid → pass through to S3
 * 3. If not valid and path is /callback → exchange auth code for token, set cookie, redirect
 * 4. Otherwise → redirect to Google OAuth
 *
 * Environment is configured via CloudFormation template parameters baked into
 * this file at deploy time (Lambda@Edge does not support env vars).
 */

// ─── CONFIG (replaced at deploy time by deploy.sh) ──────────────────
const CLIENT_ID = '{{GOOGLE_CLIENT_ID}}';
const CLIENT_SECRET = '{{GOOGLE_CLIENT_SECRET}}';
const ALLOWED_DOMAINS = '{{ALLOWED_EMAIL_DOMAINS}}'.split(',').map(d => d.trim());
const COOKIE_SECRET = '{{COOKIE_SECRET}}';
// ─────────────────────────────────────────────────────────────────────
const COOKIE_NAME = '__pi_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Simple HMAC-like signing using Web Crypto (available in Lambda@Edge Node 18+)
import { createHmac } from 'node:crypto';

function sign(payload, secret) {
  const data = JSON.stringify(payload);
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${Buffer.from(data).toString('base64url')}.${sig}`;
}

function verify(token, secret) {
  try {
    const [dataB64, sig] = token.split('.');
    const data = Buffer.from(dataB64, 'base64url').toString();
    const expected = createHmac('sha256', secret).update(data).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(data);
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function getCookie(headers, name) {
  const cookieHeader = headers.cookie;
  if (!cookieHeader) return null;
  for (const item of cookieHeader) {
    const cookies = item.value.split(';');
    for (const c of cookies) {
      const [k, ...v] = c.trim().split('=');
      if (k === name) return v.join('=');
    }
  }
  return null;
}

function redirect(url) {
  return {
    status: '302',
    statusDescription: 'Found',
    headers: {
      location: [{ key: 'Location', value: url }],
      'cache-control': [{ key: 'Cache-Control', value: 'no-cache' }],
    },
  };
}

function setCookieRedirect(url, cookieValue) {
  return {
    status: '302',
    statusDescription: 'Found',
    headers: {
      location: [{ key: 'Location', value: url }],
      'set-cookie': [{
        key: 'Set-Cookie',
        value: `${COOKIE_NAME}=${cookieValue}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400`,
      }],
      'cache-control': [{ key: 'Cache-Control', value: 'no-cache' }],
    },
  };
}

function forbidden(message) {
  return {
    status: '403',
    statusDescription: 'Forbidden',
    body: message,
    headers: {
      'content-type': [{ key: 'Content-Type', value: 'text/plain' }],
    },
  };
}

export async function handler(event) {
  const request = event.Records[0].cf.request;
  const headers = request.headers;
  const uri = request.uri;
  const host = headers.host?.[0]?.value || '';
  const REDIRECT_URI = `https://${host}/_auth/callback`;

  // ─── Callback from Google OAuth ──────────────────────────────
  if (uri === '/_auth/callback') {
    const params = new URLSearchParams(request.querystring);
    const code = params.get('code');
    const state = params.get('state') || '/';

    if (!code) {
      return forbidden('Missing authorization code');
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      return forbidden('Failed to exchange authorization code');
    }

    const tokens = await tokenRes.json();

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userRes.ok) {
      return forbidden('Failed to get user info');
    }

    const user = await userRes.json();
    const email = user.email;
    const domain = email.split('@')[1];

    // Check if email domain is allowed
    if (!ALLOWED_DOMAINS.includes(domain) && !ALLOWED_DOMAINS.includes(email)) {
      return forbidden(`Access denied for ${email}`);
    }

    // Create session cookie
    const sessionToken = sign(
      { email, exp: Date.now() + SESSION_DURATION_MS },
      COOKIE_SECRET,
    );

    return setCookieRedirect(`https://${host}${state}`, sessionToken);
  }

  // ─── Check existing session ──────────────────────────────────
  const sessionCookie = getCookie(headers, COOKIE_NAME);
  if (sessionCookie) {
    const session = verify(sessionCookie, COOKIE_SECRET);
    if (session) {
      // Valid session, pass through
      return request;
    }
  }

  // ─── No valid session → redirect to Google OAuth ─────────────
  const state = encodeURIComponent(uri || '/');
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=openid%20email%20profile` +
    `&state=${state}` +
    `&prompt=select_account`;

  return redirect(authUrl);
}
