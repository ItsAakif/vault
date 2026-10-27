// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../../tailwind.config'

// ---------------------------------------------------------------------------
// T077 / ADR-011 D1-A - the compile-level guard.
//
// This is the test the previous static guard could not be: it runs the REAL
// `tailwind.config.ts` through the REAL Tailwind/PostCSS pipeline and asserts
// that a rule is actually EMITTED for an opacity modifier on a token-derived
// colour. A source grep cannot see whether Tailwind emitted anything, which is
// how the whole alpha layer (84 source lines, 53 files) went missing silently.
//
// Honest limit: this proves a rule is emitted, not that a colour looks right.
// There is no screenshot harness, and `.dark` is unreachable today (no
// ThemeProvider is mounted - a declared non-goal of ADR-011 D1).
//
// The content is hermetic (`{ raw: ... }`), so nothing scans the repo or `.next`.
// ---------------------------------------------------------------------------

const PROBE = [
  'bg-danger/10', 'bg-danger/20', 'border-primary/20', 'bg-signal/10', 'bg-caution/10',
  'bg-positive/10', 'bg-signal-subtle/20', 'bg-muted/50', 'bg-accent/50', 'bg-background/95',
  'bg-input/30', 'border-border/50', 'text-muted-foreground/25', 'ring-ring/50',
  'bg-danger', 'bg-black/50',
  // T083: the theme's radius and elevation must reach the utilities too.
  'shadow-sm', 'shadow-xs', 'rounded-lg',
]

let css = ''

beforeAll(async () => {
  const probeConfig = {
    ...config,
    content: [{ raw: `<div class="${PROBE.join(' ')}"></div>` }],
  }
  const result = await postcss([tailwindcss(probeConfig as never)]).process(
    '@tailwind utilities;',
    { from: undefined }
  )
  css = result.css.replace(/\s+/g, ' ')
})

describe('the alpha layer compiles against the real Tailwind pipeline', () => {
  it('emits the error-boundary wash: .bg-danger/10', () => {
    expect(css).toContain('.bg-danger\\/10 { background-color: oklch(var(--danger-ch) / 0.1) }')
  })

  it('emits .bg-danger/20', () => {
    expect(css).toContain('.bg-danger\\/20 { background-color: oklch(var(--danger-ch) / 0.2) }')
  })

  it('emits .border-primary/20', () => {
    expect(css).toContain('.border-primary\\/20 { border-color: oklch(var(--signal-ch) / 0.2) }')
  })

  it('emits .bg-signal/10', () => {
    expect(css).toContain('.bg-signal\\/10 { background-color: oklch(var(--signal-ch) / 0.1) }')
  })

  it('emits .bg-caution/10', () => {
    expect(css).toContain('.bg-caution\\/10 { background-color: oklch(var(--caution-ch) / 0.1) }')
  })

  it('emits .bg-positive/10', () => {
    expect(css).toContain('.bg-positive\\/10 { background-color: oklch(var(--positive-ch) / 0.1) }')
  })

  it('emits .bg-signal-subtle/20', () => {
    expect(css).toContain(
      '.bg-signal-subtle\\/20 { background-color: oklch(var(--signal-subtle-ch) / 0.2) }'
    )
  })

  it('emits .bg-muted/50 on the sunken surface channel', () => {
    expect(css).toContain(
      '.bg-muted\\/50 { background-color: oklch(var(--surface-sunken-ch) / 0.5) }'
    )
  })

  it('emits .bg-accent/50 on the subtle signal channel', () => {
    expect(css).toContain(
      '.bg-accent\\/50 { background-color: oklch(var(--signal-subtle-ch) / 0.5) }'
    )
  })

  it('emits .bg-background/95 on the paper channel', () => {
    expect(css).toContain('.bg-background\\/95 { background-color: oklch(var(--paper-ch) / 0.95) }')
  })

  it('emits .bg-input/30 on the line channel', () => {
    expect(css).toContain('.bg-input\\/30 { background-color: oklch(var(--line-ch) / 0.3) }')
  })

  it('emits .border-border/50 on the line channel', () => {
    expect(css).toContain('.border-border\\/50 { border-color: oklch(var(--line-ch) / 0.5) }')
  })

  it('emits .text-muted-foreground/25 on the muted ink channel', () => {
    expect(css).toContain(
      '.text-muted-foreground\\/25 { color: oklch(var(--ink-muted-ch) / 0.25) }'
    )
  })

  it('emits .ring-ring/50 (a --tw-ring-color, not a background-color)', () => {
    // The ring utility writes the custom property, not a background-color; the
    // exact declaration is asserted only where the shape is stable.
    const rule = css.match(/\.ring-ring\\\/50 \{[^}]*\}/)
    expect(rule, 'no rule emitted for .ring-ring/50').not.toBeNull()
    expect(rule?.[0]).toContain('--tw-ring-color: oklch(var(--signal-ch) / 0.5)')
  })

  it('emits the bare .bg-danger utility against the same channel', () => {
    const rule = css.match(/\.bg-danger \{[^}]*\}/)
    expect(rule, 'no rule emitted for .bg-danger').not.toBeNull()
    expect(rule?.[0]).toContain('var(--danger-ch)')
    expect(rule?.[0]).toContain('--tw-bg-opacity: 1')
  })

  it('negative control: a literal colour still compiles (.bg-black/50)', () => {
    // Proves the probe is a real compile and not a vacuous pass.
    expect(css).toContain('.bg-black\\/50 { background-color: rgb(0 0 0 / 0.5) }')
  })

  it('emits every probed token-derived utility (no silent no-ops)', () => {
    for (const name of PROBE) {
      if (name === 'bg-black/50') continue
      expect(css, `no rule emitted for .${name}`).toContain(`.${name.replace('/', '\\/')} {`)
    }
  })
})

// ---------------------------------------------------------------------------
// T083 - the supplied tweakcn theme's radius and elevation scale.
//
// The values live in `:root` / `.dark` (so the scale can differ per block from
// one source), and the utilities bind to them. That indirection is asserted,
// not assumed: the rule must name the token, and the token must be normalised -
// the theme shipped `hsl(0, 0, 0 / a)`, which no browser accepts.
// ---------------------------------------------------------------------------
describe('the theme radius and elevation reach the utilities', () => {
  it('emits .shadow-sm bound to the --shadow-sm token', () => {
    const rule = css.match(/\.shadow-sm \{[^}]*\}/)
    expect(rule, 'no rule emitted for .shadow-sm').not.toBeNull()
    expect(rule?.[0]).toContain('--tw-shadow: var(--shadow-sm)')
    expect(rule?.[0]).toContain('box-shadow:')
  })

  it('emits .shadow-xs from the same scale', () => {
    const rule = css.match(/\.shadow-xs \{[^}]*\}/)
    expect(rule, 'no rule emitted for .shadow-xs').not.toBeNull()
    expect(rule?.[0]).toContain('--tw-shadow: var(--shadow-xs)')
  })

  it('emits .rounded-lg as the --radius token (1.25rem)', () => {
    expect(css).toContain('.rounded-lg { border-radius: var(--radius) }')
  })
})
