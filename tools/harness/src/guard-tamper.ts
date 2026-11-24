import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { prepareBase } from './git-base.ts';
import { type FileChange, findTampering, hunkLines, OVERRIDE_LABEL, parseNameStatus } from './tamper.ts';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'origin/main' },
    head: { type: 'string', default: 'HEAD' },
    repo: { type: 'string', default: '.' },
  },
});
const { base, head, repo } = values;
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

try {
  prepareBase(git, base);
} catch {
  console.log(`tamper-guard: cannot load base "${base}". Fix: run "git fetch origin main", or pass --base <commit>.`);
  process.exit(1);
}

const range = `${base}...${head}`;
const changes: FileChange[] = parseNameStatus(git('diff', '--name-status', '-z', '-M', range)).map((entry) => {
  if (entry.status === 'deleted') return { ...entry, added: [], removed: [] };
  const paths = entry.oldPath === undefined ? [entry.path] : [entry.oldPath, entry.path];
  return { ...entry, ...hunkLines(git('diff', '-U0', '--no-color', '--no-ext-diff', '-M', range, '--', ...paths)) };
});

const findings = findTampering(changes);
const labels = parseLabels(process.env['PR_LABELS']);
const overridden = labels.includes(OVERRIDE_LABEL);
const level = overridden ? 'warning' : 'error';

for (const finding of findings) {
  const text = `[${finding.rule}] ${finding.message}`;
  console.log(process.env['GITHUB_ACTIONS'] === 'true' ? `::${level} file=${finding.file}::${text}` : `${finding.file}: ${level} ${text}`);
}

if (findings.length === 0) {
  console.log(`tamper-guard: ${changes.length} changed files, no sensor tampering found`);
} else if (overridden) {
  console.log(`tamper-guard: ${findings.length} findings allowed by the "${OVERRIDE_LABEL}" label`);
} else {
  console.log(
    `tamper-guard: ${findings.length} findings. Fix the change, or if a human agrees it is intended, add the "${OVERRIDE_LABEL}" label to the pull request.`,
  );
  process.exitCode = 1;
}

function parseLabels(raw: string | undefined): string[] {
  if (raw === undefined || raw === '') return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((label): label is string => typeof label === 'string') : [];
}
