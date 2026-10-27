// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../../../tailwind.config'
import { JOB_STAGES, getJobStage } from '@/lib/job-stages'
import { JOB_STAGE_TONE_CLASS } from '@/components/jobs/job-stage-tones'

// ---------------------------------------------------------------------------
// T081 - the jobs stage badges are ADR-011 tokens, and they stay distinguishable.
//
// Three separate claims, each of which the old palette scale would fail:
//
//  1. every class is derived from a token that `tailwind.config.ts` really exports
//     (resolved against the config object, not against a hand-written allow-list);
//  2. the eight stages still produce eight distinct treatments - six stages in one
//     colour would be a legibility regression dressed up as consistency;
//  3. every utility emits a real CSS rule, compiled twice: hermetically (the exact
//     declaration shape) and again against the REAL content globs from the config,
//     which is the check that catches a utility living in a file Tailwind does not
//     scan. That is not theoretical: while the scale lived in `src/lib`, one stage's
//     pair emitted nothing at all because no scanned file contained it.
//
// What this does NOT prove: contrast ratios or that the palette looks good. No
// screenshot harness exists in this repo; the claims above are the ones that can be
// measured.
// ---------------------------------------------------------------------------

const COLORS = (config.theme?.extend?.colors ?? {}) as unknown as Record<string, unknown>

/** Raw Tailwind palette family names. None of these may appear as a token root. */
const PALETTE_FAMILIES = new Set([
  'red', 'blue', 'green', 'yellow', 'gray', 'grey', 'slate', 'amber', 'emerald', 'orange',
  'purple', 'zinc', 'neutral', 'stone', 'teal', 'cyan', 'indigo', 'violet', 'pink', 'rose',
  'lime', 'sky', 'fuchsia',
])

interface ParsedUtility {
  /** `bg` | `text` | `border` | `ring` */
  property: string
  /** The colour key as written, e.g. `signal-subtle` or `surface-sunken`. */
  token: string
  /** The `/opacity` modifier, if any. */
  modifier: string | null
}

function parseUtility(utility: string): ParsedUtility | null {
  const [head, modifier] = utility.split('/')
  const match = head.match(/^(bg|text|border|ring)-(.+)$/)
  if (!match) return null
  return { property: match[1], token: match[2], modifier: modifier ?? null }
}

/**
 * Resolve a colour key against the real config: `signal` -> colors.signal (a group),
 * `surface-sunken` -> colors.surface.sunken, `danger` -> colors.danger.
 */
function resolvesToToken(key: string): boolean {
  const parts = key.split('-')
  for (let take = parts.length; take >= 1; take -= 1) {
    const head = parts.slice(0, take).join('-')
    const value = COLORS[head]
    if (value === undefined) continue
    if (take === parts.length) return true
    const rest = parts.slice(take).join('-')
    if (value !== null && typeof value === 'object' && rest in (value as Record<string, unknown>)) {
      return true
    }
  }
  return false
}

const TREATMENTS = JOB_STAGES.map((stage) => {
  const parts = JOB_STAGE_TONE_CLASS[stage.id].split(/\s+/)
  return {
    id: stage.id,
    classes: parts,
    background: parts.filter((part) => part.startsWith('bg-')),
    text: parts.filter((part) => part.startsWith('text-')),
  }
})

const UTILITIES = Array.from(new Set(TREATMENTS.flatMap((t) => t.classes))).sort()

async function compile(contentConfig: unknown): Promise<string> {
  const result = await postcss([tailwindcss({ ...config, content: contentConfig } as never)]).process(
    '@tailwind utilities;',
    { from: undefined }
  )
  return result.css.replace(/\s+/g, ' ')
}

let hermeticCss = ''
let repoCss = ''

beforeAll(async () => {
  hermeticCss = await compile([{ raw: `<div class="${UTILITIES.join(' ')}"></div>` }])
  // The real content globs from tailwind.config.ts: this is what the browser gets.
  repoCss = await compile(config.content)
}, 60_000)

/** `.bg-signal/20` -> `.bg-signal\/20` (the escaped form Tailwind emits). */
function escaped(utility: string): string {
  return `.${utility.replace('/', '\\/')}`
}

describe('the stage colour vocabulary is token-derived', () => {
  it('declares a tone for every stage id and nothing else', () => {
    expect(Object.keys(JOB_STAGE_TONE_CLASS).sort()).toEqual(JOB_STAGES.map((s) => s.id).sort())
  })

  it('keeps the lib and the table in lockstep (one definition of every class)', () => {
    for (const stage of JOB_STAGES) {
      expect(getJobStage(stage.id).colorClass).toBe(JOB_STAGE_TONE_CLASS[stage.id])
    }
  })

  it('resolves every utility against a colour key exported by tailwind.config.ts', () => {
    for (const utility of UTILITIES) {
      const parsed = parseUtility(utility)
      expect(parsed, `"${utility}" is not a bg-/text-/border-/ring- utility`).not.toBeNull()
      expect(
        resolvesToToken(parsed!.token),
        `"${utility}" names "${parsed!.token}", which tailwind.config.ts does not export`
      ).toBe(true)
    }
  })

  it('names no raw palette scale in bg-, text- or border-', () => {
    for (const utility of UTILITIES) {
      const parsed = parseUtility(utility)
      expect(parsed, `"${utility}" is not a colour utility`).not.toBeNull()
      const root = parsed!.token.split('-')[0]
      expect(PALETTE_FAMILIES.has(root), `"${utility}" uses the raw palette family "${root}"`).toBe(
        false
      )
    }
  })
})

describe('the eight stages stay visually distinct', () => {
  it('produces eight distinct class strings', () => {
    const distinct = new Set(TREATMENTS.map((t) => t.classes.join(' ')))
    expect(distinct.size).toBe(JOB_STAGES.length)
  })

  it('gives every stage exactly one ground and one ink of its own', () => {
    // A stage missing either group would fall back to the Badge's default colours and
    // become indistinguishable from an unrelated badge - so both are required, not optional.
    for (const treatment of TREATMENTS) {
      expect(treatment.background, `${treatment.id} declares no bg- utility`).toHaveLength(1)
      expect(treatment.text, `${treatment.id} declares no text- utility`).toHaveLength(1)
    }
  })

  it('separates every pair of stages in at least one visible property', () => {
    // Pairwise, not aggregate: two stages sharing both a ground and an ink are the same
    // badge to a reader no matter how many other stages are distinct.
    for (let i = 0; i < TREATMENTS.length; i += 1) {
      for (let j = i + 1; j < TREATMENTS.length; j += 1) {
        const a = TREATMENTS[i]
        const b = TREATMENTS[j]
        const sameGround = a.background.join(' ') === b.background.join(' ')
        const sameInk = a.text.join(' ') === b.text.join(' ')
        expect(
          sameGround && sameInk,
          `${a.id} and ${b.id} render identically (${a.classes.join(' ')})`
        ).toBe(false)
      }
    }
  })
})

describe('every stage utility compiles', () => {
  it('emits a rule for each utility and reads the channel of the token it names', () => {
    for (const utility of UTILITIES) {
      const parsed = parseUtility(utility)!
      const start = hermeticCss.indexOf(`${escaped(utility)} {`)
      expect(start, `no rule emitted for "${utility}"`).toBeGreaterThan(-1)
      const rule = hermeticCss.slice(start, hermeticCss.indexOf('}', start) + 1)
      // The declaration must read the channel of the SAME token, e.g. bg-signal/20 ->
      // oklch(var(--signal-ch) / 0.2). A rule that exists but reads a different token
      // would be the silent-wrong-colour variant of the same defect.
      expect(rule, `"${utility}" does not read --${parsed.token}-ch`).toContain(
        `var(--${parsed.token}-ch)`
      )
    }
  })

  it('emits the exact declaration shape for the opacity-modified and subtle grounds', () => {
    expect(hermeticCss).toContain(
      '.bg-signal\\/20 { background-color: oklch(var(--signal-ch) / 0.2) }'
    )
    expect(hermeticCss).toContain(
      '.bg-caution\\/10 { background-color: oklch(var(--caution-ch) / 0.1) }'
    )
    expect(hermeticCss).toContain(
      '.bg-positive\\/10 { background-color: oklch(var(--positive-ch) / 0.1) }'
    )
    expect(hermeticCss).toContain(
      '.bg-danger\\/10 { background-color: oklch(var(--danger-ch) / 0.1) }'
    )
  })

  it('emits every utility against the real content globs, not just a probe', () => {
    // The guard for "the literal only lives in an unscanned file". `src/lib` is outside
    // the content globs, so a class written only there is never emitted.
    for (const utility of UTILITIES) {
      expect(repoCss, `"${utility}" is in no file Tailwind scans`).toContain(`${escaped(utility)} {`)
    }
  })
})
