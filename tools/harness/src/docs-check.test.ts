import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDocs, type CheckResult } from './docs-check.ts';

const NOW = new Date('2026-11-20T00:00:00Z');
const ROOT_INDEX = '---\nokf_version: "0.3"\ntitle: Test\ndescription: Test bundle.\n---\n\n# Docs\n\n* [A](a.md) - A.\n';

function concept(extraFrontmatter = '', body = 'Body.'): string {
  return [
    '---',
    'type: Architecture',
    'title: A',
    'description: One line.',
    'status: draft',
    'generated: { by: test/agent, at: "2026-11-01T00:00:00Z" }',
    extraFrontmatter,
    '---',
    '',
    body,
  ].join('\n');
}

const tempDirs: string[] = [];

async function check(files: Record<string, string>, failOnStale = false): Promise<CheckResult> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'check-docs-'));
  tempDirs.push(repoRoot);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(repoRoot, 'docs', name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return checkDocs({ repoRoot, bundleDir: 'docs', now: NOW, failOnStale });
}

const rules = (result: CheckResult) => result.findings.map((finding) => finding.rule);

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('checkDocs', () => {
  it('accepts a conformant bundle', async () => {
    const result = await check({ 'index.md': ROOT_INDEX, 'a.md': concept() });
    expect(result.findings).toEqual([]);
    expect(result.concepts).toBe(1);
  });

  it('requires frontmatter on every doc', async () => {
    const result = await check({ 'index.md': ROOT_INDEX, 'a.md': '# Just text\n' });
    expect(rules(result)).toEqual(['frontmatter.missing']);
  });

  it('reports invalid values and unknown keys with a fix, but allows x- keys', async () => {
    const result = await check({
      'index.md': ROOT_INDEX,
      'a.md': concept('staus: draft\nx-genui-owner: web').replace('status: draft', 'status: done'),
    });
    expect(rules(result).toSorted()).toEqual(['frontmatter.status', 'frontmatter.unknown-key']);
    expect(result.findings.find((finding) => finding.rule === 'frontmatter.status')?.fix).toContain('draft');
  });

  it('checks local links but ignores code, anchors and URLs', async () => {
    const body = [
      '[ok](index.md) [bad](missing.md) [web](https://example.com) [anchor](#top)',
      '`[inline](nope.md)`',
      '```',
      '[fenced](nope.md)',
      '```',
    ].join('\n');
    const result = await check({ 'index.md': ROOT_INDEX, 'a.md': concept('', body) });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ rule: 'link.broken', file: 'docs/a.md' });
    expect(result.findings[0]?.message).toContain('missing.md');
  });

  it('requires every doc to be listed in its folder index', async () => {
    const result = await check({ 'index.md': ROOT_INDEX.replace('* [A](a.md) - A.', ''), 'a.md': concept() });
    expect(rules(result)).toEqual(['index.unlisted']);
  });

  it('requires an index.md in every folder that has docs', async () => {
    const result = await check({
      'index.md': `${ROOT_INDEX}* [Sub](sub/) - Sub.\n`,
      'a.md': concept(),
      'sub/b.md': concept(),
    });
    expect(rules(result)).toEqual(['index.missing']);
    expect(result.findings[0]?.file).toBe('docs/sub/index.md');
  });

  it('allows frontmatter only on the bundle-root index', async () => {
    const result = await check({
      'index.md': `${ROOT_INDEX}* [Sub](sub/index.md) - Sub.\n`,
      'a.md': concept(),
      'sub/index.md': '---\ntitle: Sub\n---\n\n* [B](b.md) - B.\n',
      'sub/b.md': concept(),
    });
    expect(rules(result)).toEqual(['index.frontmatter']);
  });

  it('warns on stale docs, and fails when asked to', async () => {
    const files = { 'index.md': ROOT_INDEX, 'a.md': concept('stale_after: "2026-01-01"') };
    expect((await check(files)).findings).toMatchObject([{ rule: 'freshness.stale', severity: 'warning' }]);
    expect((await check(files, true)).findings).toMatchObject([{ rule: 'freshness.stale', severity: 'error' }]);
  });

  it('requires sources and stale_after on External API docs', async () => {
    const result = await check({ 'index.md': ROOT_INDEX, 'a.md': concept().replace('type: Architecture', 'type: External API') });
    expect(rules(result).toSorted()).toEqual(['frontmatter.sources', 'frontmatter.stale_after']);
  });

  it('requires every footnote to cite a sources entry', async () => {
    const extra = 'sources:\n  - { id: spec, resource: "https://example.com/spec" }';
    const result = await check({ 'index.md': ROOT_INDEX, 'a.md': concept(extra, 'Cited.[^spec] Uncited.[^other]\n\n[^spec]: Spec') });
    expect(result.findings).toMatchObject([{ rule: 'sources.unknown-footnote' }]);
    expect(result.findings[0]?.message).toContain('[^other]');
  });

  it('counts trust tiers from current verifications only', async () => {
    const result = await check({
      'index.md': `${ROOT_INDEX}* [B](b.md) - B.\n`,
      'a.md': concept('verified: { by: "human:alice", at: "2026-11-02T00:00:00Z" }'),
      'b.md': concept('verified: { by: "human:alice", at: "2026-10-01T00:00:00Z" }'),
    });
    expect(result.findings).toEqual([]);
    expect(result.trust).toEqual({ unverified: 1, 'machine-confirmed': 0, 'human-reviewed': 1 });
  });
});
