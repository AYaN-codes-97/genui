import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { describe, expect, it, onTestFinished } from 'vitest';

function waitForReadiness(child: ChildProcessWithoutNullStreams, port: number): Promise<void> {
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  return new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', () => reject(new Error(`Server exited before readiness: ${stderr}`)));
    lines.on('line', (line) => {
      if (line === `server listening on http://localhost:${port}`) resolve();
    });
  });
}

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
    });
    onTestFinished(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await once(child, 'exit');
      }
    });
    await waitForReadiness(child, port);
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  }, 15000);

  it('includes stderr if the server exits before readiness', async () => {
    const child = spawn(process.execPath, ['apps/server/src/main.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: 'invalid', NODE_ENV: 'test' },
    });
    await expect(waitForReadiness(child, 3000)).rejects.toThrow(/Server exited before readiness:.*PORT/s);
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
