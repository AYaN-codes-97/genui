import path from 'node:path';
import { checkDocs } from './docs-check.ts';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const result = await checkDocs({
  repoRoot,
  bundleDir: 'docs',
  extraFiles: ['AGENTS.md'],
  now: new Date(),
  failOnStale: process.argv.includes('--fail-on-stale'),
});

for (const finding of result.findings) {
  const fix = finding.fix === undefined ? '' : ` Fix: ${finding.fix}`;
  console.log(`${finding.file}: ${finding.severity} [${finding.rule}] ${finding.message}${fix}`);
}

const errors = result.findings.filter((finding) => finding.severity === 'error').length;
const warnings = result.findings.length - errors;
const { trust } = result;
console.log(
  `check-docs: ${result.concepts} docs (${trust['human-reviewed']} human-reviewed, ${trust['machine-confirmed']} machine-confirmed, ${trust.unverified} unverified); ${errors} errors, ${warnings} warnings`,
);
process.exitCode = errors > 0 ? 1 : 0;
