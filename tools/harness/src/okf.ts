import { z } from 'zod';

// House profile: stricter than OKF v0.3, which only requires `type`.
export const CONCEPT_TYPES = [
  'Architecture',
  'API Contract',
  'Architecture Decision',
  'External API',
  'Design',
] as const;

const Timestamp = z.union([z.iso.datetime({ offset: true }), z.iso.date()], {
  error: 'Must be an RFC 3339 date-time with offset ("2026-11-20T04:02:58Z") or a date ("2026-11-20").',
});

// OKF §7: `<producer>/<version>` for tools and agents, `<scheme>:<id>` for everything else.
const Actor = z
  .string()
  .regex(/^(?:[a-z][a-z\d+.-]*:\S+|[^\s/:]+\/\S+)$/i, { error: 'Must be "<tool>/<model>" or "<scheme>:<id>".' });

const Event = z.object({ by: Actor, at: Timestamp });

const Source = z.object({
  id: z.string().min(1).optional(),
  resource: z.string().min(1),
  title: z.string().optional(),
  author: Actor.optional(),
  last_modified: Timestamp.optional(),
});

const conceptShape = {
  type: z.enum(CONCEPT_TYPES),
  title: z.string().min(1),
  description: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\n]+$/, { error: 'Must be a single line.' }),
  status: z.enum(['draft', 'stable', 'deprecated']),
  tags: z.array(z.string().min(1)).optional(),
  resource: z.string().min(1).optional(),
  generated: Event,
  verified: z.union([Event, z.array(Event).min(1)]).optional(),
  stale_after: Timestamp.optional(),
  superseded_by: z.string().min(1).optional(),
  sources: z.array(Source).min(1).optional(),
};

export const CONCEPT_KEYS: ReadonlySet<string> = new Set(Object.keys(conceptShape));

export const ConceptSchema = z.object(conceptShape).superRefine((concept, ctx) => {
  if (concept.type === 'External API') {
    if (!concept.sources) {
      ctx.addIssue({ code: 'custom', path: ['sources'], message: 'An External API doc must list its sources.' });
    }
    if (!concept.stale_after) {
      ctx.addIssue({ code: 'custom', path: ['stale_after'], message: 'An External API doc must set stale_after.' });
    }
  }
  if (concept.superseded_by && concept.status !== 'deprecated') {
    ctx.addIssue({ code: 'custom', path: ['superseded_by'], message: 'Only valid with status: deprecated.' });
  }
});
export type Concept = z.infer<typeof ConceptSchema>;

export const BundleIndexSchema = z.object({
  okf_version: z.literal('0.3'),
  title: z.string().min(1),
  description: z.string().min(1),
  license: z.string().optional(),
});

export const FIX_HINTS: Readonly<Record<string, string>> = {
  type: `Use one of: ${CONCEPT_TYPES.join(', ')}.`,
  title: 'Add a short display title.',
  description: 'One sentence, at most 200 characters, no line breaks. index.md entries reuse it.',
  status: 'Use draft until a human has reviewed the content, stable after review, deprecated when replaced.',
  generated: 'Use generated: { by: "<tool>/<model>" or "human:<github-user>", at: "<RFC 3339 time>" }.',
  verified: 'Each event needs by and at. Agents never add a human: actor; only humans verify as humans.',
  stale_after: 'Use a quoted RFC 3339 date, e.g. "2027-02-20".',
  sources: 'Each source needs a resource (URL or path). Add an id when the body cites it as [^id].',
  superseded_by: 'Set status: deprecated and point to the replacing doc.',
  okf_version: 'The bundle-root index.md must declare okf_version: "0.3".',
};

export type TrustTier = 'unverified' | 'machine-confirmed' | 'human-reviewed';

// OKF §5.3: only verifications at or after the last meaningful change count.
export function trustTier(concept: Concept): TrustTier {
  const generatedAt = Date.parse(concept.generated.at);
  const events = concept.verified === undefined ? [] : [concept.verified].flat();
  const current = events.filter((event) => Date.parse(event.at) >= generatedAt);
  if (current.some((event) => event.by.startsWith('human:'))) return 'human-reviewed';
  return current.length > 0 ? 'machine-confirmed' : 'unverified';
}
