import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// T078 / ADR-011 D1-A - the static guard for the invalid-alpha defect class.
//
// `src/components/editor/mdx-editor.css` is a hand-written stylesheet that reads
// the token custom properties directly. An earlier palette sweep stripped the
// wrapping `hsl()` from declarations like a bare alpha applied to a complete
// custom property, which is not valid CSS outside a colour function and is
// silently dropped by every browser. D1-A restores an alpha path using the bare
// channel sources: `oklch(var(--<source>-ch) / a)`.
//
// This is a *static text* guard, not a rendering assertion: it can prove the
// broken form is gone and that the channel names it uses exist in `globals.css`,
// but it cannot prove a colour looks right - there is no screenshot harness.
//
// NOTE on the patterns. The task's sketch patterns (`/var\(--[a-z-]+\)\s*\//`
// and `/oklch\(var\(--/`) also match the *correct* `oklch(var(--x-ch) / a)`
// form, so they can never be zero while the required declarations exist; see
// .planning/progress/T078.md. The checks below use precise patterns that match
// only the actual defect:
//   - a bare `var(--name) / a` that is NOT already inside oklch()/hsl();
//   - `oklch(var(--name) / ...)` where `name` is not a `-ch` channel source
//     (the nested `oklch(oklch(...) / a)` mistake).
// Comments are stripped first so prose can never trip a textual guard.
// ---------------------------------------------------------------------------

const repoRoot = process.cwd()
const mdxCssRaw = readFileSync(
  path.join(repoRoot, 'src', 'components', 'editor', 'mdx-editor.css'),
  'utf8'
)
const globalsCss = readFileSync(
  path.join(repoRoot, 'src', 'app', 'globals.css'),
  'utf8'
)
const mdxCss = mdxCssRaw.replace(/\/\*[\s\S]*?\*\//g, '')

describe('mdx-editor.css - token reads (ADR-011 D1-A)', () => {
  it('contains no bare `var(--name) /` alpha form outside a colour function', () => {
    // `(?<!oklch\()` excludes the correct `oklch(var(--x-ch) / a)` form.
    expect(mdxCss).not.toMatch(/(?<!oklch\()var\(--[a-z-]+\)\s*\//)
  })

  it('contains no `hsl(var(` and no nested-oklch mistake', () => {
    expect(mdxCss).not.toMatch(/hsl\(var\(/)
    // Every `oklch(var(--<name>)` must reference a `-ch` channel source.
    const nested = [...mdxCss.matchAll(/oklch\(var\(--([a-z-]+)\)/g)]
    expect(nested.length, 'expected the channel-alpha form to be present').toBeGreaterThan(0)
    for (const [, name] of nested) {
      expect(
        name,
        `oklch(var(--${name})) nests an already-derived colour; use a -ch source`
      ).toMatch(/-ch$/)
    }
  })

  it('uses at least 10 `oklch(var(--<name>-ch) / ` alpha declarations', () => {
    const matches = mdxCss.match(/oklch\(var\(--[a-z-]+-ch\)\s*\/\s*/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(10)
  })

  it('references only channel names that are declared in globals.css', () => {
    const used = new Set<string>()
    const re = /var\(--([a-z-]+-ch)\)/g
    let match: RegExpExecArray | null
    while ((match = re.exec(mdxCss)) !== null) {
      used.add(match[1])
    }
    expect(used.size, 'expected at least one channel reference').toBeGreaterThan(0)
    for (const name of used) {
      expect(
        globalsCss,
        `--${name} is referenced by mdx-editor.css but never declared in globals.css`
      ).toMatch(new RegExp(`--${name}\\s*:`))
    }
  })

  it('keeps the complete-colour reads (the design keeps these working)', () => {
    for (const name of [
      'background',
      'border',
      'foreground',
      'primary',
      'primary-foreground',
      'accent',
      'accent-foreground',
      'muted',
      'muted-foreground',
    ]) {
      // `var(--muted)` must not be confused with `var(--muted-foreground)`: the
      // closing paren is required immediately after the name.
      expect(
        mdxCss,
        `expected a complete-colour read of var(--${name})`
      ).toMatch(new RegExp(`var\\(--${name}\\)`))
    }
  })
})
