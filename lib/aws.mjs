// AWS access for the crucible, with no dependencies: Signature Version 4 signing over Web Crypto,
// Cognito Hosted UI sign-in (authorization code + PKCE), Cognito Identity Pool credentials, and
// read-only S3 GetObject / DynamoDB GetItem. Loaded by index.html only when a remote source is set.
//
// Works in browsers and in Node 20+ (crypto.subtle, fetch and TextEncoder are globals in both).

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async data => crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data);
const hmac = async (key, msg) => {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
};
// RFC 3986 encoding, as SigV4 requires (encodeURIComponent leaves !'()* alone).
const uriEncode = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/**
 * Signs a request with AWS Signature Version 4 and returns the headers to send (without Host,
 * which the browser sets itself). `contentSha256: true` adds x-amz-content-sha256, which S3 requires.
 */
export async function signRequest({ method = 'GET', url, service, region, headers = {}, body = '', creds, now = new Date(), contentSha256 = false }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = hex(await sha256(body));
  const h = {};
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = String(v);
  h.host = u.host;
  h['x-amz-date'] = amzDate;
  if (contentSha256) h['x-amz-content-sha256'] = payloadHash;
  if (creds.sessionToken) h['x-amz-security-token'] = creds.sessionToken;

  const names = Object.keys(h).sort();
  const canonicalHeaders = names.map(n => `${n}:${h[n].trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = names.join(';');
  // S3 paths are encoded once; every other service encodes them twice.
  const segments = u.pathname.split('/').map(s => uriEncode(decodeURIComponent(s)));
  const path = (service === 's3' ? segments : segments.map(uriEncode)).join('/') || '/';
  const query = [...u.searchParams].map(([k, v]) => [uriEncode(k), uriEncode(v)]).sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&');
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(await sha256(canonicalRequest))].join('\n');
  let key = await hmac('AWS4' + creds.secretAccessKey, date);
  key = await hmac(key, region);
  key = await hmac(key, service);
  key = await hmac(key, 'aws4_request');
  const signature = hex(await hmac(key, stringToSign));

  h.authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  delete h.host;
  return h;
}

async function awsError(res, what) {
  let detail = '';
  try {
    const text = await res.text();
    const m = text.match(/"message"\s*:\s*"([^"]+)"/i) || text.match(/<Message>([^<]+)<\/Message>/) || text.match(/"__type"\s*:\s*"([^"]+)"/);
    detail = m ? m[1] : '';
  } catch { /* body unreadable */ }
  return new Error(`${what} failed (${res.status}${detail ? `: ${detail}` : ''})`);
}

/** Reads a JSON object from S3 with signed GetObject. */
export async function readS3({ region, bucket, key }, creds) {
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${key.split('/').map(uriEncode).join('/')}`;
  const headers = await signRequest({ url, service: 's3', region, creds, contentSha256: true });
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw await awsError(res, `Reading s3://${bucket}/${key}`);
  return res.json();
}

/** Reads one board's document from DynamoDB: the item whose key attribute equals `board`; the document is a JSON string attribute. */
export async function readDynamo({ region, table, board, keyName = 'board', attribute = 'doc' }, creds) {
  const url = `https://dynamodb.${region}.amazonaws.com/`;
  const body = JSON.stringify({ TableName: table, Key: { [keyName]: { S: board } }, ConsistentRead: true });
  const headers = await signRequest({
    method: 'POST', url, service: 'dynamodb', region, creds, body,
    headers: { 'content-type': 'application/x-amz-json-1.0', 'x-amz-target': 'DynamoDB_20120810.GetItem' },
  });
  const res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) throw await awsError(res, `Reading ${table}/${board}`);
  const out = await res.json();
  const value = out.Item?.[attribute];
  if (!value) throw new Error(`No board "${board}" in table ${table}.`);
  if (value.S) return JSON.parse(value.S);
  throw new Error(`${table}/${board}: attribute "${attribute}" must be a JSON string.`);
}

// ---- Cognito sign-in ---------------------------------------------------------------------------

const store = {
  get(k) { try { return sessionStorage.getItem('crucible.' + k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem('crucible.' + k, v); } catch { /* storage unavailable */ } },
  del(k) { try { sessionStorage.removeItem('crucible.' + k); } catch { /* storage unavailable */ } },
};
const jwtClaims = t => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; } };
const jwtExp = t => (jwtClaims(t).exp || 0) * 1000;

/**
 * Cognito sign-in for a public app client (no secret) on the Hosted UI, then Identity Pool
 * credentials for the signed-in user. Tokens live in sessionStorage: closing the tab signs out.
 *
 * cfg: { region, userPoolId, userPoolClientId, identityPoolId, domain, redirectUri? }
 */
export function cognitoAuth(cfg) {
  const domain = cfg.domain.replace(/\/$/, '');
  const redirectUri = cfg.redirectUri || location.origin + location.pathname;
  const provider = `cognito-idp.${cfg.region}.amazonaws.com/${cfg.userPoolId}`;
  let cached = null;

  async function token(params) {
    const res = await fetch(`${domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.userPoolClientId, ...params }),
    });
    if (!res.ok) throw await awsError(res, 'Sign-in');
    const t = await res.json();
    store.set('id', t.id_token);
    if (t.refresh_token) store.set('refresh', t.refresh_token);
    return t.id_token;
  }

  async function identity(target, body) {
    const res = await fetch(`https://cognito-identity.${cfg.region}.amazonaws.com/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `AWSCognitoIdentityService.${target}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await awsError(res, 'Getting AWS credentials');
    return res.json();
  }

  async function idToken() {
    const id = store.get('id');
    if (id && jwtExp(id) > Date.now() + 60_000) return id;
    const refresh = store.get('refresh');
    if (refresh) {
      try { return await token({ grant_type: 'refresh_token', refresh_token: refresh }); } catch { store.del('refresh'); }
    }
    return null;
  }

  return {
    /** Finishes a Hosted UI redirect if the URL carries one. Call once on load. */
    async handleRedirect() {
      const p = new URLSearchParams(location.search);
      if (!p.has('code') && !p.has('error')) return;
      const clean = () => {
        ['code', 'state', 'error', 'error_description'].forEach(k => p.delete(k));
        history.replaceState(null, '', location.pathname + (p.size ? `?${p}` : '') + location.hash);
      };
      if (p.has('error')) { const msg = p.get('error_description') || p.get('error'); clean(); throw new Error(`Sign-in was not completed: ${msg}`); }
      const state = store.get('state'), verifier = store.get('verifier');
      const code = p.get('code'), returned = p.get('state');
      clean();
      store.del('state'); store.del('verifier');
      if (!state || state !== returned || !verifier) throw new Error('Sign-in could not be verified. Please sign in again.');
      await token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier });
    },
    async signedIn() { return Boolean(await idToken()); },
    /** The signed-in user's email, lowercased: the key of their board. Null when signed out. */
    async email() { const id = await idToken(); const e = id && jwtClaims(id).email; return typeof e === 'string' ? e.toLowerCase() : null; },
    /** Sends the browser to the Hosted UI. */
    async signIn() {
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
      const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
      store.set('verifier', verifier);
      store.set('state', state);
      const q = new URLSearchParams({
        response_type: 'code', client_id: cfg.userPoolClientId, redirect_uri: redirectUri, scope: 'openid email',
        state, code_challenge: b64url(await sha256(verifier)), code_challenge_method: 'S256',
      });
      location.assign(`${domain}/oauth2/authorize?${q}`);
    },
    signOut() {
      ['id', 'refresh', 'state', 'verifier'].forEach(store.del);
      cached = null;
      location.assign(`${domain}/logout?${new URLSearchParams({ client_id: cfg.userPoolClientId, logout_uri: redirectUri })}`);
    },
    /** Temporary AWS credentials for the signed-in user, or null when nobody is signed in. */
    async credentials() {
      if (cached && cached.expiration - 60_000 > Date.now()) return cached;
      const id = await idToken();
      if (!id) return null;
      const Logins = { [provider]: id };
      const { IdentityId } = await identity('GetId', { IdentityPoolId: cfg.identityPoolId, Logins });
      const { Credentials: c } = await identity('GetCredentialsForIdentity', { IdentityId, Logins });
      cached = { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretKey, sessionToken: c.SessionToken, expiration: c.Expiration * 1000 };
      return cached;
    },
  };
}
