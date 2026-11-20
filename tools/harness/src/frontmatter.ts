import { parseDocument } from 'yaml';

export type Frontmatter =
  | { readonly kind: 'none'; readonly body: string }
  | { readonly kind: 'ok'; readonly data: Record<string, unknown>; readonly body: string }
  | { readonly kind: 'invalid'; readonly reason: string; readonly body: string };

// OKF §4: the block starts at line 1 with exactly `---` and ends at the next line that is exactly `---`.
export function splitFrontmatter(source: string): Frontmatter {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0] !== '---') return { kind: 'none', body: lines.join('\n') };

  const close = lines.indexOf('---', 1);
  if (close === -1) {
    return { kind: 'invalid', reason: 'Frontmatter opens with --- but never closes.', body: '' };
  }

  const body = lines.slice(close + 1).join('\n');
  const doc = parseDocument(lines.slice(1, close).join('\n'), { version: '1.2', schema: 'core', uniqueKeys: true });
  const firstError = doc.errors[0];
  if (firstError) return { kind: 'invalid', reason: firstError.message, body };

  const data: unknown = doc.toJS();
  if (!isMapping(data)) return { kind: 'invalid', reason: 'Frontmatter must be a YAML mapping.', body };
  return { kind: 'ok', data, body };
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
