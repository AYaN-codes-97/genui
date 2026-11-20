const FENCED_CODE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm;
const INLINE_CODE = /`[^`\n]+`/g;
const INLINE_LINK = /!?\[(?:[^\]\\]|\\.)*\]\(\s*<?([^\s)>]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REFERENCE_DEFINITION = /^ {0,3}\[(?!\^)[^\]]+\]:\s*<?(\S+?)>?(?:\s+.*)?$/gm;
const FOOTNOTE_REFERENCE = /\[\^([^\]\s]+)\](?!:)/g;

function stripCode(markdown: string): string {
  return markdown.replace(FENCED_CODE, '').replace(INLINE_CODE, '');
}

export function linkTargets(markdown: string): string[] {
  const text = stripCode(markdown);
  return [...text.matchAll(INLINE_LINK), ...text.matchAll(REFERENCE_DEFINITION)]
    .map((match) => match[1] ?? '')
    .filter((target) => target !== '');
}

export function footnoteLabels(markdown: string): string[] {
  const labels = [...stripCode(markdown).matchAll(FOOTNOTE_REFERENCE)].map((match) => match[1] ?? '');
  return [...new Set(labels)].filter((label) => label !== '');
}

export function isExternal(target: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//');
}
