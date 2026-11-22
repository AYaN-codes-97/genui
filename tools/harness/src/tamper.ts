export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export type FileChange = {
  readonly path: string;
  readonly oldPath?: string;
  readonly status: ChangeStatus;
  readonly added: readonly string[];
  readonly removed: readonly string[];
};

export type TamperRule =
  | 'protected-path'
  | 'test-deleted'
  | 'test-disabled'
  | 'suppression'
  | 'assertions-removed'
  | 'compiler-loosened'
  | 'verify-script-changed';

export type TamperFinding = { readonly file: string; readonly rule: TamperRule; readonly message: string };

export const OVERRIDE_LABEL = 'harness-change';

const PROTECTED_PATHS = [
  /^\.github\//,
  /^tools\/harness\//,
  /^AGENTS\.md$/,
  /^\.oxlintrc\.json$/,
  /^tsconfig\.base\.json$/,
  /(?:^|\/)vitest\.(?:config|workspace)\.[cm]?[jt]s$/,
];
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const TSCONFIG = /(?:^|\/)tsconfig[\w.-]*\.json$/;
const DISABLED_TEST =
  /\b(?:describe|it|test|suite|bench)\s*\.\s*(?:skip|only|todo|fails|skipIf|runIf|fixme)\b|\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(/;
const SUPPRESSION = /@ts-(?:ignore|nocheck|expect-error)|\b(?:oxlint|eslint)-disable/;
const ASSERTION = /\bexpect(?:\.soft)?\s*\(|\bassert(?:\.\w+)?\s*\(/g;
const LOOSENED_COMPILER =
  /"(?:strict\w*|no[A-Z]\w*|exactOptionalPropertyTypes|useUnknownInCatchVariables|erasableSyntaxOnly|verbatimModuleSyntax|isolatedModules)"\s*:\s*false/;
const ROOT_SENSOR_SCRIPT = /"(?:verify|test|lint|typecheck|check:[\w-]+)"\s*:/;
const TYPECHECK_SCRIPT = /"typecheck"\s*:\s*"([^"]*)"/;

export function findTampering(changes: readonly FileChange[]): TamperFinding[] {
  return changes.flatMap(findingsFor);
}

function findingsFor(change: FileChange): TamperFinding[] {
  const { path, oldPath, status } = change;
  const finding = (rule: TamperRule, message: string): TamperFinding => ({ file: path, rule, message });

  if ([path, oldPath].some((p) => p !== undefined && PROTECTED_PATHS.some((pattern) => pattern.test(p)))) {
    return [finding('protected-path', `Changes a protected file (${status}${oldPath ? ` from ${oldPath}` : ''}).`)];
  }

  const findings: TamperFinding[] = [];
  if (status === 'deleted' && TEST_FILE.test(path)) {
    findings.push(finding('test-deleted', 'Deletes a test file.'));
  }
  if (status === 'renamed' && oldPath !== undefined && TEST_FILE.test(oldPath) && !TEST_FILE.test(path)) {
    findings.push(finding('test-deleted', `Renames test file ${oldPath} so it no longer runs.`));
  }

  if (CODE_FILE.test(path)) {
    for (const line of change.added) {
      if (DISABLED_TEST.test(line)) findings.push(finding('test-disabled', `Adds a skipped or focused test: ${excerpt(line)}`));
      if (SUPPRESSION.test(line)) findings.push(finding('suppression', `Adds a type or lint suppression: ${excerpt(line)}`));
    }
  }

  if (TEST_FILE.test(path) && status !== 'deleted') {
    const lost = countAssertions(change.removed) - countAssertions(change.added);
    if (lost > 0) findings.push(finding('assertions-removed', `Removes ${lost} more assertion(s) than it adds.`));
  }

  if (TSCONFIG.test(path)) {
    for (const line of change.added.filter((l) => LOOSENED_COMPILER.test(l))) {
      findings.push(finding('compiler-loosened', `Turns off a compiler check: ${excerpt(line)}`));
    }
  }

  if (path === 'package.json') {
    for (const line of [...change.added, ...change.removed].filter((l) => ROOT_SENSOR_SCRIPT.test(l))) {
      findings.push(finding('verify-script-changed', `Changes a sensor script: ${excerpt(line)}`));
    }
  } else if (path.endsWith('/package.json')) {
    for (const line of change.added) {
      const script = TYPECHECK_SCRIPT.exec(line)?.[1];
      if (script !== undefined && !/\btsc\b/.test(script)) {
        findings.push(finding('verify-script-changed', `typecheck script does not run tsc: ${excerpt(line)}`));
      }
    }
  }

  return findings;
}

function countAssertions(lines: readonly string[]): number {
  return lines.reduce((sum, line) => sum + (line.match(ASSERTION)?.length ?? 0), 0);
}

function excerpt(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

// Parses `git diff --name-status -z -M` output.
export function parseNameStatus(output: string): Omit<FileChange, 'added' | 'removed'>[] {
  const tokens = output.split('\0').filter((token) => token !== '');
  const entries: Omit<FileChange, 'added' | 'removed'>[] = [];
  for (let i = 0; i < tokens.length; ) {
    const code = tokens[i++]?.[0];
    if (code === 'R' || code === 'C') {
      const oldPath = tokens[i++] ?? '';
      const path = tokens[i++] ?? '';
      entries.push(code === 'R' ? { path, oldPath, status: 'renamed' } : { path, status: 'added' });
    } else {
      const path = tokens[i++] ?? '';
      entries.push({ path, status: code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified' });
    }
  }
  return entries;
}

// Collects changed lines from a unified diff, skipping file headers before the first hunk.
export function hunkLines(patch: string): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  let inHunk = false;
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) inHunk = false;
    else if (line.startsWith('@@')) inHunk = true;
    else if (inHunk && line.startsWith('+')) added.push(line.slice(1));
    else if (inHunk && line.startsWith('-')) removed.push(line.slice(1));
  }
  return { added, removed };
}
