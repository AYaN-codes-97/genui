import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { type Git, prepareBase } from './git-base.ts';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};
const tempDirs: string[] = [];
// Creating real git repos takes seconds on Windows; the 5 s default would make these flaky.
const GIT_FIXTURE_TIMEOUT = 30_000;

function gitIn(dir: string): Git {
  return (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: GIT_ENV, stdio: 'pipe' });
}

async function commit(git: Git, dir: string, file: string): Promise<void> {
  await writeFile(path.join(dir, file), file);
  git('add', file);
  git('commit', '-q', '-m', file);
}

// An origin with three commits on main, cloned the way the agent's environment is: shallow, without origin/main.
async function agentLikeClone(): Promise<{ git: Git; dir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'guard-base-'));
  tempDirs.push(root);
  const origin = path.join(root, 'origin');
  execFileSync('git', ['init', '-q', '-b', 'main', origin], { env: GIT_ENV });
  for (const file of ['a.txt', 'b.txt', 'c.txt']) await commit(gitIn(origin), origin, file);

  const dir = path.join(root, 'clone');
  execFileSync('git', ['clone', '-q', '--depth', '1', pathToFileURL(origin).href, dir], { env: GIT_ENV });
  const git = gitIn(dir);
  git('switch', '-q', '-c', 'agent/work');
  git('update-ref', '-d', 'refs/remotes/origin/main');
  await commit(git, dir, 'change.txt');
  return { git, dir };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('prepareBase', () => {
  it('fetches a missing origin/main and full history so the diff range works', async () => {
    const { git } = await agentLikeClone();
    expect(() => git('rev-parse', '--verify', '--quiet', 'origin/main')).toThrow('Command failed');

    prepareBase(git, 'origin/main');

    expect(git('rev-parse', '--is-shallow-repository').trim()).toBe('false');
    expect(git('diff', '--name-only', 'origin/main...HEAD').trim()).toBe('change.txt');
  }, GIT_FIXTURE_TIMEOUT);

  it('leaves an explicit commit base alone', async () => {
    const { git } = await agentLikeClone();
    const head = git('rev-parse', 'HEAD').trim();

    prepareBase(git, head);

    expect(git('rev-parse', '--is-shallow-repository').trim()).toBe('true');
  }, GIT_FIXTURE_TIMEOUT);
});
