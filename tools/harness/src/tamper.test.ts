import { describe, expect, it } from 'vitest';
import { type FileChange, findTampering, hunkLines, parseNameStatus } from './tamper.ts';

function change(path: string, added: string[] = [], removed: string[] = [], extra: Partial<FileChange> = {}): FileChange {
  return { path, status: 'modified', added, removed, ...extra };
}

const rules = (changes: FileChange[]) => findTampering(changes).map((finding) => finding.rule);

describe('findTampering', () => {
  it('accepts ordinary source and test changes', () => {
    expect(
      findTampering([
        change('apps/server/src/app.ts', ['export const port = 3000;']),
        change('apps/server/src/app.test.ts', ["it('works', () => {", '  expect(port).toBe(3000);', '});']),
        change('tsconfig.json', ['  "strict": true,']),
      ]),
    ).toEqual([]);
  });

  it.each(['.github/workflows/ci.yml', 'tools/harness/src/tamper.ts', 'AGENTS.md', '.oxlintrc.json', 'tsconfig.base.json', 'apps/web/vitest.config.ts'])(
    'flags a change to protected path %s',
    (path) => {
      expect(rules([change(path)])).toEqual(['protected-path']);
    },
  );

  it('flags moving a protected file out of its protected location', () => {
    expect(rules([change('notes/old-ci.yml', [], [], { status: 'renamed', oldPath: '.github/workflows/ci.yml' })])).toEqual(['protected-path']);
  });

  it('flags deleting a test, or renaming it so it no longer runs', () => {
    expect(rules([change('packages/shared/src/api.test.ts', [], [], { status: 'deleted' })])).toEqual(['test-deleted']);
    expect(
      rules([change('packages/shared/src/api.ts.bak', [], [], { status: 'renamed', oldPath: 'packages/shared/src/api.test.ts' })]),
    ).toEqual(['test-deleted']);
  });

  it.each([
    "it.skip('parses', () => {",
    "describe.only('stream', () => {",
    "test.todo('later')",
    "it.fails('known bug', () => {",
    "xit('parses', () => {",
    "it.skipIf(process.env.CI)('slow', () => {",
  ])('flags a skipped or focused test: %s', (line) => {
    expect(rules([change('apps/server/src/app.test.ts', [line])])).toContain('test-disabled');
  });

  it.each(['// @ts-ignore', '// @ts-expect-error wrong type', '/* @ts-nocheck */', '// oxlint-disable-next-line no-explicit-any'])(
    'flags an added suppression: %s',
    (line) => {
      expect(rules([change('apps/server/src/app.ts', [line])])).toEqual(['suppression']);
    },
  );

  it('ignores suppressions that are only removed, and text in non-code files', () => {
    expect(rules([change('apps/server/src/app.ts', [], ['// @ts-ignore'])])).toEqual([]);
    expect(rules([change('docs/architecture/system.md', ['Never use `it.skip` or `@ts-ignore`.'])])).toEqual([]);
  });

  it('flags a test file that loses assertions', () => {
    const removed = ['  expect(a).toBe(1);', '  expect(b).toBe(2);'];
    expect(rules([change('apps/server/src/app.test.ts', ['  expect(a).toBe(1);'], removed)])).toEqual(['assertions-removed']);
  });

  it('accepts rewritten assertions when the count does not drop', () => {
    expect(rules([change('apps/server/src/app.test.ts', ['  expect(a).toEqual(1);'], ['  expect(a).toBe(1);'])])).toEqual([]);
  });

  it('flags turning off a compiler check in any tsconfig', () => {
    expect(rules([change('apps/server/tsconfig.json', ['    "strict": false,'])])).toEqual(['compiler-loosened']);
    expect(rules([change('apps/web/tsconfig.app.json', ['"noUncheckedIndexedAccess": false'])])).toEqual(['compiler-loosened']);
  });

  it('flags changes to the root sensor scripts but not to other scripts', () => {
    expect(rules([change('package.json', ['    "verify": "npm test",'], ['    "verify": "npm run typecheck && npm test",'])])).toEqual([
      'verify-script-changed',
      'verify-script-changed',
    ]);
    expect(rules([change('package.json', ['    "dev": "node apps/server/src/main.ts",'])])).toEqual([]);
  });

  it('flags a workspace typecheck script that stops running tsc', () => {
    expect(rules([change('apps/server/package.json', ['    "typecheck": "echo ok"'])])).toEqual(['verify-script-changed']);
    expect(rules([change('apps/server/package.json', ['    "typecheck": "tsc --noEmit -p tsconfig.json"'])])).toEqual([]);
  });
});

describe('parseNameStatus', () => {
  it('reads statuses and renames from -z output', () => {
    const output = ['M', 'a.ts', 'A', 'b.ts', 'D', 'c.test.ts', 'R087', 'old.test.ts', 'new.ts', ''].join('\0');
    expect(parseNameStatus(output)).toEqual([
      { path: 'a.ts', status: 'modified' },
      { path: 'b.ts', status: 'added' },
      { path: 'c.test.ts', status: 'deleted' },
      { path: 'new.ts', oldPath: 'old.test.ts', status: 'renamed' },
    ]);
  });
});

describe('hunkLines', () => {
  it('collects changed lines but not file headers', () => {
    const patch = ['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -1,2 +1,2 @@', ' same', '-old', '+new'].join('\n');
    expect(hunkLines(patch)).toEqual({ added: ['new'], removed: ['old'] });
  });
});
