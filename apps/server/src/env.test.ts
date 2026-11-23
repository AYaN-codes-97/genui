import { afterEach, describe, expect, it, vi } from 'vitest';
import { readEnv } from './env.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('readEnv', () => {
  it('defaults absent values', () => {
    expect(readEnv({})).toEqual({ PORT: 3000, NODE_ENV: 'development' });
  });

  it.each(['1', '3000', '65535'])('accepts port %s', (PORT) => {
    expect(readEnv({ PORT, NODE_ENV: 'production' })).toEqual({ PORT: Number(PORT), NODE_ENV: 'production' });
  });

  it.each(['', '0', '-1', '65536', '1.5', 'abc', 'Infinity'])('rejects invalid PORT %j', (PORT) => {
    expect(() => readEnv({ PORT })).toThrow(/PORT/);
  });

  it.each(['development', 'test', 'production'])('accepts NODE_ENV %s', (NODE_ENV) => {
    expect(readEnv({ NODE_ENV }).NODE_ENV).toBe(NODE_ENV);
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => readEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('reads process.env by default', () => {
    vi.stubEnv('PORT', '4321');
    vi.stubEnv('NODE_ENV', 'test');
    expect(readEnv()).toEqual({ PORT: 4321, NODE_ENV: 'test' });
  });
});
