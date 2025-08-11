import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createClient } from 'redis';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const SERVICE_NAME = process.env.SERVICE_NAME || 'OIDC Service';
const REDIS_HOST = process.env.REDIS_CLUSTER_ENDPOINT;
const REDIS_PORT = Number(process.env.REDIS_CLUSTER_PORT || 6379);
const SECRET_ARN = process.env.SECRET_MANAGER_NAME_USERPASS;

function parseSecretString(s: string): { username?: string; password?: string } | null {
  try {
    const o = JSON.parse(s);
    if (o && typeof o === 'object') {
      return {
        username: o.username ?? o.user ?? undefined,
        password: o.password ?? o.redis_password ?? o.authToken ?? o.token ?? undefined
      };
    }
  } catch {
    if (s) return { password: s };
  }
  return null;
}

async function getCreds(): Promise<{ username?: string; password?: string } | null> {
  if (!SECRET_ARN) return null;
  const sm = new SecretsManagerClient({});
  const out = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
  if (out.SecretString) return parseSecretString(out.SecretString);
  if (out.SecretBinary) {
    const buf = Buffer.isBuffer(out.SecretBinary)
      ? out.SecretBinary
      : Buffer.from(out.SecretBinary as any);
    return parseSecretString(buf.toString('utf8'));
  }
  return null;
}

async function pingRedis(): Promise<{ ok: boolean; message: string }> {
  if (!REDIS_HOST || Number.isNaN(REDIS_PORT)) {
    return { ok: false, message: 'Redis env not configured' };
  }
  const creds = await getCreds();
  const client = createClient({
    socket: { host: REDIS_HOST, port: REDIS_PORT },
    username: creds?.username,
    password: creds?.password
  });

  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return { ok: pong?.toLowerCase() === 'pong', message: pong ?? 'No response' };
  } catch (e) {
    try { await client.quit(); } catch {}
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

function html(body: string, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body: `<!doctype html><meta charset="utf-8"><title>${SERVICE_NAME}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:2rem}
.badge{display:inline-block;padding:.25rem .5rem;border-radius:.5rem;background:#eee}
.ok{background:#d1fae5}.fail{background:#fee2e2}code{background:#f6f6f6;padding:.1rem .25rem;border-radius:.25rem}
</style>
<h1>${SERVICE_NAME}</h1>${body}`
  };
}

export const mainHandler = async (_evt: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const res = await pingRedis();
  const badge = `<span class="badge ${res.ok ? 'ok' : 'fail'}">${res.ok ? 'OK' : 'FAIL'}</span>`;
  const body = `
    <p>Redis connectivity: ${badge}</p>
    <ul>
      <li>Endpoint: <code>${REDIS_HOST ?? 'n/a'}</code></li>
      <li>Port: <code>${REDIS_PORT || 'n/a'}</code></li>
      <li>Secret: <code>${SECRET_ARN ? '[configured]' : 'n/a'}</code></li>
    </ul>
    <p>Details: <code>${res.message}</code></p>
  `;
  return html(body);
};
