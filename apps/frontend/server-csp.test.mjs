import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

async function getAvailablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

test('production CSP allows embedded GLTF textures to load from blob URLs', async () => {
  const port = await getAvailablePort();
  const serverPath = fileURLToPath(new URL('./server.mjs', import.meta.url));
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      BACKEND_FALLBACK_URL: '',
      RAILWAY_ENVIRONMENT_ID: '',
      RAILWAY_ENVIRONMENT: '',
      RAILWAY_PROJECT_ID: '',
      RAILWAY_SERVICE_ID: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(
        () => reject(new Error(`Frontend server did not start: ${output}`)),
        10_000,
      );
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes(`[frontend] listening on 0.0.0.0:${port}`)) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Frontend server exited early with code ${code}`));
      });
    });

    const response = await fetch(`http://127.0.0.1:${port}/`);
    const policy = response.headers.get('content-security-policy') ?? '';
    const connectSource = policy
      .split(';')
      .find((directive) => directive.trim().startsWith('connect-src '));

    assert.ok(connectSource, 'CSP should define connect-src');
    assert.match(connectSource, /(?:^|\s)blob:(?:\s|$)/);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
  }
});
