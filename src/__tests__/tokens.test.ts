import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// T067 / ADR-011 D1 - the Vault token layer. AMENDED IN PLACE by T077 for
// ADR-011 D1-A (channel-source tokens), never deleted: T067's escalation was
// the correct outcome and its record stays.
//
// This is a *static text* guard, not a rendering assertion. It proves the token
// layer exists, that the shadcn names are remapped onto it *by reference* (so the
// two cannot diverge), that every semantic token carries a BARE channel source
// paired with a DERIVED full-colour name, and that the data palette
// (--chart-1..5) was not swept.
// It cannot prove a colour looks right - there is no screenshot harness - and
// `.dark` stays unreachable until a ThemeProvider is mounted (a declared
// non-goal of ADR-011 D1), which is why the dark half is asserted structurally.
//
// D1-A specifically: a source grep cannot see whether Tailwind *emitted*
// anything, which is how the whole alpha layer went missing. The real guard for
// that is the compile test in `token-alpha.test.ts`; this file is the supporting
// text guard.
// ---------------------------------------------------------------------------

const repoRoot = process.cwd()
const globalsCss = readFileSync(
  path.join(repoRoot, 'src', 'app', 'globals.css'),
  'utf8'
)
const tailwindConfig = readFileSync(
  path.join(repoRoot, 'tailwind.config.ts'),
  'utf8'
)

/** Slice the declaration body of the `:root`/`.dark` block that contains `marker`. */
function blockContaining(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker)
  expect(markerIndex, `marker ${marker} not present in file`).toBeGreaterThanOrEqual(0)
  const open = source.lastIndexOf('{', markerIndex)
  const close = source.indexOf('}', markerIndex)
  expect(open, `no opening brace before ${marker}`).toBeGreaterThanOrEqual(0)
  expect(close, `no closing brace after ${marker}`).toBeGreaterThan(open)
  return source.slice(open + 1, close)
}

// The token-bearing `:root` block is the second one (the first only holds fonts);
// anchoring on `--radius` selects it unambiguously.
const lightBlock = blockContaining(globalsCss, '--radius')
// T077: `--paper` no longer carries a literal, so the dark anchor moved to the
// bare channel declaration. T083 moved the *value* to the supplied theme's.
const darkBlock = blockContaining(globalsCss, '--paper-ch: 0.1063')

const TOKENS = [
  '--app-header-h:',
  '--paper:',
  '--surface:',
  '--surface-sunken:',
  '--ink:',
  '--ink-muted:',
  '--ink-faint:',
  '--line:',
  '--signal:',
  '--signal-ink:',
  '--signal-subtle:',
  '--positive:',
  '--caution:',
  '--danger:',
]

// The full remap from ADR-011 D1 step (c). Every one must point by reference.
// The last two entries are T077's R3 completion - the two names T067 left as
// literals, which in `.dark` were wrong by construction.
const REMAP: Array<[string, string]> = [
  ['--background', '--paper'],
  ['--foreground', '--ink'],
  ['--card', '--surface'],
  ['--card-foreground', '--ink'],
  ['--popover', '--surface'],
  ['--popover-foreground', '--ink'],
  ['--muted', '--surface-sunken'],
  ['--muted-foreground', '--ink-muted'],
  ['--border', '--line'],
  ['--input', '--line'],
  ['--primary', '--signal'],
  ['--primary-foreground', '--signal-ink'],
  ['--secondary', '--surface-sunken'],
  ['--secondary-foreground', '--ink'],
  ['--accent', '--signal-subtle'],
  ['--accent-foreground', '--ink'],
  ['--destructive', '--danger'],
  ['--ring', '--signal'],
  ['--sidebar-primary-foreground', '--signal-ink'],
  ['--sidebar-accent-foreground', '--ink'],
]

// ADR-011 D1-A step 1: 13 semantic tokens, each a (bare channel, derived
// full-colour) pair. `.dark` carries the same 13 names.
const CHANNELS = [
  '--paper-ch:',
  '--surface-ch:',
  '--surface-sunken-ch:',
  '--ink-ch:',
  '--ink-muted-ch:',
  '--ink-faint-ch:',
  '--line-ch:',
  '--signal-ch:',
  '--signal-ink-ch:',
  '--signal-subtle-ch:',
  '--positive-ch:',
  '--caution-ch:',
  '--danger-ch:',
]

// The 25 config keys ADR-011 D1-A wraps, as the channel each one points at.
// A multiset, because several keys share a channel (border/input/line all read
// `--line-ch`). Comparing this exact multiset proves both that 25 keys are
// wrapped and that no *other* key was wrapped.
const EXPECTED_WRAPPED_SOURCES = [
  'paper-ch', 'paper-ch',
  'ink-ch', 'ink-ch',
  'signal-ch', 'signal-ch', 'signal-ch',
  'surface-sunken-ch', 'surface-sunken-ch', 'surface-sunken-ch',
  'ink-muted-ch', 'ink-muted-ch',
  'signal-subtle-ch', 'signal-subtle-ch',
  'danger-ch', 'danger-ch',
  'line-ch', 'line-ch', 'line-ch',
  'surface-ch',
  'ink-faint-ch', 'ink-faint-ch',
  'signal-ink-ch',
  'positive-ch',
  'caution-ch',
]

/** Extract `--<name>-ch: <value>;` declarations from a block body. */
function channelDeclarations(block: string): Map<string, string> {
  const found = new Map<string, string>()
  const re = /--([a-z-]+-ch):\s*([^;]+);/g
  let match: RegExpExecArray | null
  while ((match = re.exec(block)) !== null) {
    found.set(`--${match[1]}:`, match[2].trim())
  }
  return found
}

const lightChannels = channelDeclarations(lightBlock)
const darkChannels = channelDeclarations(darkBlock)

/** Every `--<source>-ch` named by an `<alpha-value>` wrapper in the config. */
const wrappedSources = ((): string[] => {
  const found: string[] = []
  const re = /oklch\(var\(--([a-z-]+-ch)\) \/ <alpha-value>\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(tailwindConfig)) !== null) {
    found.push(match[1])
  }
  return found
})()

describe('globals.css defines the token layer', () => {
  it('declares every named token in :root', () => {
    for (const token of TOKENS) {
      expect(lightBlock, `:root is missing ${token}`).toContain(token)
    }
  })

  it('declares the theme-dependent tokens (and --app-header-h) in .dark', () => {
    for (const token of TOKENS) {
      expect(darkBlock, `.dark is missing ${token}`).toContain(token)
    }
    // T077: the literals moved onto the bare channel names.
    // T083: values replaced with the supplied theme's (channel form kept).
    expect(darkBlock).toContain('--signal-ch: 0.3820 0.1967 265.2890')
    expect(lightBlock).toContain('--signal-ch: 0.2236 0.1469 265.8205')
  })

  it('keeps --app-header-h a plain length (ADR-011 D1-A R2)', () => {
    expect(lightBlock).toContain('--app-header-h: 3.5rem')
    expect(darkBlock).toContain('--app-header-h: 3.5rem')
  })
})

// T083: the supplied theme's radius, tracking and elevation scale. The shadows
// are asserted in their NORMALISED form - the theme shipped them as
// `hsl(0, 0, 0 / 0.05)`, which mixes legacy commas with slash-alpha and drops
// the `%` unit. A regression to that malformed form is a silent-drop bug, so it
// is guarded here rather than only being fixed once.
describe('the supplied theme radius, tracking and elevation are adopted', () => {
  it('sets --radius to 1.25rem in both blocks', () => {
    expect(lightBlock).toContain('--radius: 1.25rem')
    expect(darkBlock).toContain('--radius: 1.25rem')
  })

  it('sets --tracking-normal in both blocks and applies it to body', () => {
    expect(lightBlock).toContain('--tracking-normal: -0.01em')
    expect(darkBlock).toContain('--tracking-normal: -0.01em')
    expect(globalsCss).toContain('letter-spacing: var(--tracking-normal)')
  })

  it('declares the full shadow scale in both blocks', () => {
    for (const step of [
      '--shadow-2xs:',
      '--shadow-xs:',
      '--shadow-sm:',
      '--shadow:',
      '--shadow-md:',
      '--shadow-lg:',
      '--shadow-xl:',
      '--shadow-2xl:',
    ]) {
      expect(lightBlock, `:root is missing ${step}`).toContain(step)
      expect(darkBlock, `.dark is missing ${step}`).toContain(step)
    }
  })

  it('normalises every shadow and keeps no legacy comma form', () => {
    expect(lightBlock).toContain(
      '--shadow-sm: 0px 4px 10px 0px hsl(0 0% 0% / 0.10), 0px 1px 2px -1px hsl(0 0% 0% / 0.10)'
    )
    expect(darkBlock).toContain(
      '--shadow-sm: 0px 10px 20px 0px hsl(0 0% 0% / 0.50), 0px 1px 2px -1px hsl(0 0% 0% / 0.50)'
    )
    // `hsl(0, 0, 0 / a)` - commas mixed with slash-alpha, no `%` unit.
    expect(globalsCss).not.toMatch(/hsl\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\//)
  })
})

describe('every semantic token is a (bare channel, derived colour) pair', () => {
  for (const channel of CHANNELS) {
    it(`:root declares ${channel} as bare channels`, () => {
      const value = lightChannels.get(channel)
      expect(value, `:root is missing ${channel}`).toBeDefined()
      // Bare channels only: `oklch(`, `var(` and `/` all fail this.
      expect(value, `:root ${channel} is not bare channels`).toMatch(/^[\d.%\s+-]+$/)
    })

    it(`.dark declares ${channel} as bare channels`, () => {
      const value = darkChannels.get(channel)
      expect(value, `.dark is missing ${channel}`).toBeDefined()
      expect(value, `.dark ${channel} is not bare channels`).toMatch(/^[\d.%\s+-]+$/)
    })
  }

  it('declares exactly the 13 channel sources in :root', () => {
    expect([...lightChannels.keys()].sort()).toEqual([...CHANNELS].sort())
  })

  it('declares exactly the 13 channel sources in .dark', () => {
    expect([...darkChannels.keys()].sort()).toEqual([...CHANNELS].sort())
  })

  it('derives every full-colour name from its channel in both blocks', () => {
    for (const channel of CHANNELS) {
      const base = channel.replace(/-ch:$/, ':')
      expect(lightBlock, `:root is missing ${base}`).toContain(`${base} oklch(var(${channel.replace(/:$/, '')}));`)
      expect(darkBlock, `.dark is missing ${base}`).toContain(`${base} oklch(var(${channel.replace(/:$/, '')}));`)
    }
  })

  it('does not channel-ise --chart-1..5', () => {
    for (let i = 1; i <= 5; i++) {
      expect(lightChannels.has(`--chart-${i}-ch:`)).toBe(false)
      expect(darkChannels.has(`--chart-${i}-ch:`)).toBe(false)
    }
  })
})

describe('the shadcn names are remapped by reference in both blocks', () => {
  for (const [shadcn, token] of REMAP) {
    it(`:root maps ${shadcn} -> var(${token})`, () => {
      expect(lightBlock).toContain(`${shadcn}: var(${token})`)
    })
    it(`.dark maps ${shadcn} -> var(${token})`, () => {
      expect(darkBlock).toContain(`${shadcn}: var(${token})`)
    })
  }

  it('points the remap at a COMPLETE colour, never at a channel name', () => {
    // The whole point of D1-A: `--primary` still holds `var(--signal)`, which is
    // `oklch(var(--signal-ch))`, so direct readers keep working.
    for (const [shadcn] of REMAP) {
      expect(lightBlock).not.toContain(`${shadcn}: var(--${shadcn.replace(/^--/, '')}-ch)`)
    }
  })
})

describe('the data palette stays a complete-colour data palette', () => {
  // T083 adopted the supplied theme's --chart-1..5 values. The *intent* of this
  // guard is unchanged: the data palette is a separate, byte-stable, complete
  // colour set that is never channel-ised (ADR-011 section 4).
  it('keeps the adopted --chart-1 light literal byte-for-byte', () => {
    expect(lightBlock).toContain('--chart-1: oklch(0.4691 0.2225 262.4817)')
  })
  it('keeps --chart-1..5 in both blocks', () => {
    for (let i = 1; i <= 5; i++) {
      expect(lightBlock).toContain(`--chart-${i}:`)
      expect(darkBlock).toContain(`--chart-${i}:`)
    }
  })
})

describe('tailwind.config.ts exports the semantic utilities', () => {
  it('maps ink (DEFAULT/muted/faint) to the channel wrappers', () => {
    expect(tailwindConfig).toMatch(
      /ink:\s*\{[\s\S]*?DEFAULT:\s*'oklch\(var\(--ink-ch\) \/ <alpha-value>\)'/
    )
    expect(tailwindConfig).toContain("'oklch(var(--ink-muted-ch) / <alpha-value>)'")
    expect(tailwindConfig).toContain("'oklch(var(--ink-faint-ch) / <alpha-value>)'")
  })

  it('maps line (DEFAULT/strong) to the line / faint-ink channels', () => {
    expect(tailwindConfig).toMatch(
      /line:\s*\{[\s\S]*?DEFAULT:\s*'oklch\(var\(--line-ch\) \/ <alpha-value>\)'/
    )
    expect(tailwindConfig).toContain("'oklch(var(--ink-faint-ch) / <alpha-value>)'")
  })

  it('maps surface (DEFAULT/sunken) and paper to the channel wrappers', () => {
    expect(tailwindConfig).toContain("paper: 'oklch(var(--paper-ch) / <alpha-value>)'")
    expect(tailwindConfig).toMatch(
      /surface:\s*\{[\s\S]*?DEFAULT:\s*'oklch\(var\(--surface-ch\) \/ <alpha-value>\)'/
    )
    expect(tailwindConfig).toContain("'oklch(var(--surface-sunken-ch) / <alpha-value>)'")
  })

  it('maps signal (DEFAULT/ink/subtle) to the channel wrappers', () => {
    expect(tailwindConfig).toMatch(
      /signal:\s*\{[\s\S]*?DEFAULT:\s*'oklch\(var\(--signal-ch\) \/ <alpha-value>\)'/
    )
    expect(tailwindConfig).toContain("'oklch(var(--signal-ink-ch) / <alpha-value>)'")
    expect(tailwindConfig).toContain("'oklch(var(--signal-subtle-ch) / <alpha-value>)'")
  })

  it('maps positive, caution and danger to the channel wrappers', () => {
    expect(tailwindConfig).toContain("positive: 'oklch(var(--positive-ch) / <alpha-value>)'")
    expect(tailwindConfig).toContain("caution: 'oklch(var(--caution-ch) / <alpha-value>)'")
    expect(tailwindConfig).toContain("danger: 'oklch(var(--danger-ch) / <alpha-value>)'")
  })

  it('removes no existing colour entry', () => {
    for (const entry of [
      "background: 'oklch(var(--paper-ch) / <alpha-value>)'",
      "foreground: 'oklch(var(--ink-ch) / <alpha-value>)'",
      "border: 'oklch(var(--line-ch) / <alpha-value>)'",
      "input: 'oklch(var(--line-ch) / <alpha-value>)'",
      "ring: 'oklch(var(--signal-ch) / <alpha-value>)'",
    ]) {
      expect(tailwindConfig, `missing ${entry}`).toContain(entry)
    }
    for (const key of [
      'card:',
      'popover:',
      'primary:',
      'secondary:',
      'muted:',
      'accent:',
      'destructive:',
      'chart:',
    ]) {
      expect(tailwindConfig, `missing colour group ${key}`).toContain(key)
    }
  })

  it('maps the font stacks and the elevation scale (T083 theme)', () => {
    expect(tailwindConfig).toContain("sans: ['var(--font-sans)']")
    expect(tailwindConfig).toContain("mono: ['var(--font-mono)']")
    expect(tailwindConfig).toContain("serif: ['var(--font-serif)']")
    // Each utility binds to its token, so the value lives in one place and can
    // differ between `:root` and `.dark`.
    for (const entry of [
      "'2xs': 'var(--shadow-2xs)'",
      "xs: 'var(--shadow-xs)'",
      "sm: 'var(--shadow-sm)'",
      "DEFAULT: 'var(--shadow)'",
      "md: 'var(--shadow-md)'",
      "lg: 'var(--shadow-lg)'",
      "xl: 'var(--shadow-xl)'",
      "'2xl': 'var(--shadow-2xl)'",
    ]) {
      expect(tailwindConfig, `boxShadow is missing ${entry}`).toContain(entry)
    }
  })

  it('leaves the 13 non-channel keys on a bare var() mapping', () => {
    for (const entry of [
      "DEFAULT: 'var(--card)'",
      "foreground: 'var(--card-foreground)'",
      "DEFAULT: 'var(--popover)'",
      "foreground: 'var(--popover-foreground)'",
      "foreground: 'var(--primary-foreground)'",
      "foreground: 'var(--secondary-foreground)'",
      "foreground: 'var(--accent-foreground)'",
      "foreground: 'var(--destructive-foreground)'",
      "'1': 'var(--chart-1)'",
      "'5': 'var(--chart-5)'",
    ]) {
      expect(tailwindConfig, `missing ${entry}`).toContain(entry)
    }
  })
})

describe('the config and the layer cannot drift', () => {
  it('wraps exactly the 25 enumerated keys and no others', () => {
    expect(wrappedSources).toHaveLength(25)
    expect([...wrappedSources].sort()).toEqual([...EXPECTED_WRAPPED_SOURCES].sort())
  })

  it('names exactly 25 <alpha-value> wrappers in the config', () => {
    expect(tailwindConfig.match(/<alpha-value>/g) ?? []).toHaveLength(25)
  })

  it('every -ch named by the config exists in globals.css', () => {
    for (const source of wrappedSources) {
      expect(lightBlock, `config names --${source}, globals.css does not declare it`).toContain(
        `--${source}:`
      )
    }
  })

  it('every -ch declared in globals.css is named by the config (no orphan either way)', () => {
    for (const channel of CHANNELS) {
      const source = channel.replace(/^--/, '').replace(/:$/, '')
      expect(wrappedSources, `--${source} is declared but no config key wraps it`).toContain(source)
    }
  })
})

describe('no raw hex literal is introduced', () => {
  it('globals.css contains no #rrggbb literal', () => {
    expect(globalsCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
  it('tailwind.config.ts contains no #rrggbb literal', () => {
    expect(tailwindConfig).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
