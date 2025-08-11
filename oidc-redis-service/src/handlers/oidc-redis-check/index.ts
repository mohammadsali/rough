import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createClient } from 'redis';

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const redisHost = process.env.REDIS_HOST ?? '';
  const redisPassword = process.env.REDIS_PASSWORD ?? '';

  let statusHtml = '';

  if (!redisHost) {
    statusHtml = `<h2 style="color:red;">❌ REDIS_HOST is not set</h2>`;
  } else {
    const start = Date.now();
    const redisClient = createClient({
      socket: { host: redisHost, tls: false },
      password: redisPassword || undefined
    });

    try {
      await redisClient.connect();
      await redisClient.ping();
      const ms = Date.now() - start;
      statusHtml = `<h2 style="color:green;">✅ Connected to Redis</h2><p>Host: ${redisHost}</p><p>Time: ${ms}ms</p>`;
    } catch (err: any) {
      const ms = Date.now() - start;
      statusHtml = `<h2 style="color:red;">❌ Failed to connect to Redis</h2><p>Host: ${redisHost}</p><p>Error: ${err?.message}</p><p>Time: ${ms}ms</p>`;
    } finally {
      await redisClient.disconnect().catch(() => {});
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>OIDC Service</title></head><body><h1>OIDC Service</h1>${statusHtml}</body></html>`
  };
};
