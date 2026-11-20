import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { splitFrontmatter } from './frontmatter.ts';
import { footnoteLabels, isExternal, linkTargets } from './links.ts';
import { BundleIndexSchema, CONCEPT_KEYS, ConceptSchema, FIX_HINTS, trustTier, type TrustTier } from './okf.ts';

export type Finding = {
  readonly file: string;
  readonly severity: 'error' | 'warning';
  readonly rule: string;
  readonly message: string;
  readonly fix?: string;
};

export type CheckOptions = {
  readonly repoRoot: string;
  readonly bundleDir: string;
  readonly extraFiles?: readonly string[];
  readonly now: Date;
  readonly failOnStale?: boolean;
};

export type CheckResult = {
  readonly findings: Finding[];
  readonly concepts: number;
  readonly trust: Record<TrustTier, number>;
};

type Report = (file: string, severity: Finding['severity'], rule: string, message: string, fix?: string) => void;

export async function checkDocs(options: CheckOptions): Promise<CheckResult> {
  const repoRoot = path.resolve(options.repoRoot);
  const bundleRoot = path.resolve(repoRoot, options.bundleDir);
  const findings: Finding[] = [];
  const report: Report = (file, severity, rule, message, fix) => {
    const relative = path.relative(repoRoot, file).split(path.sep).join('/');
    findings.push(fix === undefined ? { file: relative, severity, rule, message } : { file: relative, severity, rule, message, fix });
  };

  const trust: Record<TrustTier, number> = { unverified: 0, 'machine-confirmed': 0, 'human-reviewed': 0 };
  const conceptsByDir = new Map<string, string[]>();
  const indexTargets = new Map<string, string[]>();

  for (const file of await listMarkdown(bundleRoot)) {
    const name = path.basename(file);
    const frontmatter = splitFrontmatter(await readFile(file, 'utf8'));
    const body = frontmatter.body;

    if (name === 'index.md') {
      checkIndexFrontmatter(file, file === path.join(bundleRoot, 'index.md'), frontmatter, report);
      indexTargets.set(path.dirname(file), resolvedLocalTargets(body, file, bundleRoot));
    } else if (name === 'log.md') {
      checkLog(file, frontmatter, report);
    } else {
      const dir = path.dirname(file);
      conceptsByDir.set(dir, [...(conceptsByDir.get(dir) ?? []), file]);
      const tier = checkConcept(file, frontmatter, { bundleRoot, repoRoot, now: options.now, failOnStale: options.failOnStale ?? false }, report);
      if (tier) trust[tier] += 1;
    }
    checkLinks(file, body, bundleRoot, repoRoot, report);
  }

  for (const extra of options.extraFiles ?? []) {
    const file = path.resolve(repoRoot, extra);
    if (existsSync(file)) checkLinks(file, await readFile(file, 'utf8'), repoRoot, repoRoot, report);
  }

  checkIndexCoverage(bundleRoot, conceptsByDir, indexTargets, report);

  const concepts = [...conceptsByDir.values()].reduce((sum, files) => sum + files.length, 0);
  return { findings, concepts, trust };
}

async function listMarkdown(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { recursive: true });
  return entries
    .filter((entry) => entry.endsWith('.md'))
    .filter((entry) => !entry.split(/[\\/]/).some((segment) => segment.startsWith('.')))
    .map((entry) => path.join(root, entry))
    .toSorted();
}

function checkIndexFrontmatter(file: string, isBundleRoot: boolean, frontmatter: ReturnType<typeof splitFrontmatter>, report: Report): void {
  if (!isBundleRoot) {
    if (frontmatter.kind !== 'none') {
      report(file, 'error', 'index.frontmatter', 'Only the bundle-root index.md may have frontmatter (OKF §8).', 'Remove the frontmatter block.');
    }
    return;
  }
  if (frontmatter.kind !== 'ok') {
    report(file, 'error', 'index.bundle-metadata', 'The bundle-root index.md needs frontmatter with okf_version, title and description.', FIX_HINTS['okf_version']);
    return;
  }
  const parsed = BundleIndexSchema.safeParse(frontmatter.data);
  for (const issue of parsed.error?.issues ?? []) {
    const key = String(issue.path[0] ?? 'root');
    report(file, 'error', `index.${key}`, issue.message, FIX_HINTS[key]);
  }
}

function checkLog(file: string, frontmatter: ReturnType<typeof splitFrontmatter>, report: Report): void {
  if (frontmatter.kind !== 'none') {
    report(file, 'error', 'log.frontmatter', 'log.md has no frontmatter (OKF §9).', 'Remove the frontmatter block.');
  }
  const dates = [...frontmatter.body.matchAll(/^## (.+)$/gm)].map((match) => (match[1] ?? '').trim());
  for (const date of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      report(file, 'error', 'log.heading', `Log heading "${date}" is not a YYYY-MM-DD date.`, 'Group entries under "## YYYY-MM-DD" headings.');
    }
  }
  if (dates.some((date, i) => i > 0 && date > (dates[i - 1] ?? ''))) {
    report(file, 'error', 'log.order', 'Log dates must be newest first.', 'Reorder the date sections, newest at the top.');
  }
}

type ConceptContext = { bundleRoot: string; repoRoot: string; now: Date; failOnStale: boolean };

function checkConcept(file: string, frontmatter: ReturnType<typeof splitFrontmatter>, context: ConceptContext, report: Report): TrustTier | undefined {
  if (frontmatter.kind === 'none') {
    report(file, 'error', 'frontmatter.missing', 'Every doc in the bundle must be a typed concept.', 'Add frontmatter with type, title, description, status and generated.');
    return undefined;
  }
  if (frontmatter.kind === 'invalid') {
    report(file, 'error', 'frontmatter.yaml', frontmatter.reason, 'Fix the YAML between the --- lines.');
    return undefined;
  }

  for (const key of Object.keys(frontmatter.data)) {
    if (!CONCEPT_KEYS.has(key) && !key.startsWith('x-')) {
      report(file, 'error', 'frontmatter.unknown-key', `Unknown key "${key}".`, 'Fix the typo, or prefix custom keys with x-genui-.');
    }
  }

  const parsed = ConceptSchema.safeParse(frontmatter.data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'root');
      report(file, 'error', `frontmatter.${issue.path.join('.') || 'root'}`, issue.message, FIX_HINTS[key]);
    }
    return undefined;
  }
  const concept = parsed.data;

  if (concept.stale_after !== undefined && Date.parse(concept.stale_after) <= context.now.getTime()) {
    report(
      file,
      context.failOnStale ? 'error' : 'warning',
      'freshness.stale',
      `Stale since ${concept.stale_after}: re-check it against its sources.`,
      'Re-verify the content, then add a verified event and move stale_after forward.',
    );
  }

  const pathFields = [concept.resource, concept.superseded_by, ...(concept.sources ?? []).map((source) => source.resource)];
  for (const value of pathFields) {
    if (value === undefined || isExternal(value) || /\s/.test(value)) continue;
    if (!existsSync(resolveTarget(value, file, context.bundleRoot))) {
      report(file, 'error', 'path.broken', `Path field value "${value}" does not resolve to a file.`, 'Fix the path relative to this file.');
    }
  }

  const sourceIds = new Set((concept.sources ?? []).flatMap((source) => (source.id === undefined ? [] : [source.id])));
  for (const label of footnoteLabels(frontmatter.body)) {
    if (!sourceIds.has(label)) {
      report(file, 'error', 'sources.unknown-footnote', `Footnote [^${label}] has no sources entry with id "${label}".`, FIX_HINTS['sources']);
    }
  }

  return trustTier(concept);
}

function resolveTarget(target: string, fromFile: string, root: string): string {
  const withoutFragment = target.replace(/[?#].*$/, '');
  let decoded = withoutFragment;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    // Keep the raw value; the existence check reports it.
  }
  return decoded.startsWith('/') ? path.join(root, decoded.slice(1)) : path.resolve(path.dirname(fromFile), decoded);
}

function localTargets(body: string): string[] {
  return linkTargets(body).filter((target) => !isExternal(target) && !target.startsWith('#'));
}

function resolvedLocalTargets(body: string, file: string, root: string): string[] {
  return localTargets(body).map((target) => resolveTarget(target, file, root));
}

function checkLinks(file: string, body: string, root: string, repoRoot: string, report: Report): void {
  for (const target of localTargets(body)) {
    const resolved = resolveTarget(target, file, root);
    if (path.relative(repoRoot, resolved).startsWith('..')) {
      report(file, 'error', 'link.outside-repo', `Link "${target}" points outside the repository.`, 'Use an absolute https:// URL instead.');
    } else if (!existsSync(resolved)) {
      report(file, 'error', 'link.broken', `Link target "${target}" does not exist.`, 'Fix the path relative to this file, or remove the link.');
    }
  }
}

function checkIndexCoverage(bundleRoot: string, conceptsByDir: Map<string, string[]>, indexTargets: Map<string, string[]>, report: Report): void {
  const contentDirs = new Set<string>();
  for (const dir of conceptsByDir.keys()) {
    for (let current = dir; !path.relative(bundleRoot, current).startsWith('..'); current = path.dirname(current)) {
      contentDirs.add(current);
      if (current === bundleRoot) break;
    }
  }

  for (const dir of [...contentDirs].toSorted()) {
    const index = path.join(dir, 'index.md');
    const targets = indexTargets.get(dir);
    if (!targets) {
      report(index, 'error', 'index.missing', 'This folder has docs but no index.md.', 'Add index.md listing each doc as "* [Title](file.md) - description".');
      continue;
    }
    const covers = (candidate: string) => targets.some((target) => target === candidate || target.startsWith(candidate + path.sep));
    for (const concept of conceptsByDir.get(dir) ?? []) {
      if (!covers(concept)) {
        report(index, 'error', 'index.unlisted', `${path.basename(concept)} is not listed in this index.`, 'Add an entry: * [Title](file.md) - description.');
      }
    }
    for (const child of contentDirs) {
      if (path.dirname(child) === dir && child !== dir && !covers(child)) {
        report(index, 'error', 'index.unlisted', `Subfolder ${path.basename(child)}/ is not linked from this index.`, 'Add an entry linking the subfolder or its index.md.');
      }
    }
  }
}
