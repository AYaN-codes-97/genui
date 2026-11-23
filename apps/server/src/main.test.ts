import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';

describe('server entry point', () => {
  it('listens on the configured port', async () => {
    const reservation = createServer().listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const address = reservation.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP address');
    const port = address.port;
    await new Promise<void>((resolve, reject) => {
      reservation.close((error) => error ? reject(error) : resolve());
    });

    const child = spawn(process.execPath, ['apps/server/src/main.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
      stdio: 'ignore',
    });
    try {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          response = await fetch(`http://127.0.0.1:${port}/health`);
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      expect(response?.status).toBe(200);
      expect(await response?.json()).toEqual({ status: 'ok' });
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await once(child, 'exit');
      }
    }
  });

  it('rejects invalid configuration before listening', async () => {
    const child = spawn(process.execPath, ['apps/server/src/main.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: 'invalid', NODE_ENV: 'test' },
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    const [code] = await once(child, 'close');
    expect(code).not.toBe(0);
    expect(stderr).toContain('PORT');
  });
});
