import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * T072 regression guard: the seven container pages adopt ONE shell shape and
 * carry none of their own chrome (ADR-010 D1/D3, ADR-011 D3).
 *
 * This is a static-source assertion rather than a render test on purpose: it must
 * fail if a page drifts back to a hand-rolled header, a `container` wrapper, a
 * nested `min-h-screen`, a `text-3xl` title, or a raw palette literal - all of
 * which are invisible to a DOM assertion that only looks at what a mock happened
 * to render. Same technique as `mdx-editor-css.test.ts` and `tokens.test.ts`.
 */

const ROOT = process.cwd()

const CONTAINER_PAGES = [
  'src/app/(app)/search/page.tsx',
  'src/app/(app)/files/page.tsx',
  'src/app/(app)/settings/cloud-storage/page.tsx',
  'src/app/(app)/settings/content-types/page.tsx',
  'src/app/(app)/settings/data/page.tsx',
  'src/app/(app)/settings/integrations/page.tsx',
  'src/app/(app)/calendar/integrations/page.tsx',
]

function source(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf8')
}

// Tailwind's own palette scales, `white`/`black`, raw hex and raw colour functions.
// The token layer is the only source of colour (ADR-011 D1).
const PALETTE_LITERAL =
  /(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|placeholder|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|\bbg-white\b|\btext-white\b|\bbg-black\b|#[0-9a-fA-F]{3,8}\b|\brgba?\(|\boklch\(/

describe('container pages adopt the shell frame (T072)', () => {
  it.each(CONTAINER_PAGES)('%s imports PageHeader from the shell', (file) => {
    const src = source(file)
    expect(src).toMatch(/import \{[^}]*PageHeader[^}]*\} from '@\/components\/shell'/)
    expect(src).toContain('<PageHeader')
  })

  it.each(CONTAINER_PAGES)('%s uses the shared p-6 frame and the p-0 header reset', (file) => {
    const src = source(file)
    // The one container idiom: p-6 frame + PageHeader with its built-in
    // `px-6 pt-6` collapsed by twMerge so the title aligns with the body.
    expect(src).toContain('<div className="p-6 space-y-6">')
    expect(src).toMatch(/<PageHeader\s+className="p-0"/)
  })

  it.each(CONTAINER_PAGES)('%s sets no page-title class of its own', (file) => {
    const src = source(file)
    expect(src).not.toMatch(/text-3xl|tracking-tight/)
    // No page may render its own h1: the PageHeader owns the page title.
    expect(src).not.toMatch(/<h1[\s>]/)
  })

  it.each(CONTAINER_PAGES)('%s creates no second scroll context or centring container', (file) => {
    const src = source(file)
    expect(src).not.toMatch(/min-h-screen|\bh-screen\b/)
    expect(src).not.toMatch(/className="[^"]*\bcontainer\b/)
  })

  it.each(CONTAINER_PAGES)('%s renders no navigation chrome and no auth gate', (file) => {
    const src = source(file)
    expect(src).not.toMatch(/<header[\s>]|<nav[\s>]/)
    expect(src).not.toMatch(/SidebarNav|AppRail|AppHeader|BreadcrumbNav/)
    expect(src).not.toMatch(/useAuth|useSession/)
  })

  it.each(CONTAINER_PAGES)('%s carries no raw palette literal', (file) => {
    expect(source(file)).not.toMatch(PALETTE_LITERAL)
  })
})

describe('the features T072 had to preserve', () => {
  it('/files still offers the server-local file provider (ADR-012 D2)', () => {
    expect(source('src/app/(app)/files/page.tsx')).toContain('Local Storage')
  })

  it('/files keeps its sonner toast paths', () => {
    const src = source('src/app/(app)/files/page.tsx')
    expect(src).toMatch(/from 'sonner'/)
    expect(src).toMatch(/toast\.(success|error)\(/)
  })

  it('/settings/cloud-storage is Google-only and keeps the mobile link flow', () => {
    const src = source('src/app/(app)/settings/cloud-storage/page.tsx')
    expect(src).not.toMatch(/TabsTrigger|OneDrive|Dropbox/i)
    expect(src).toContain('Connect to Google Drive')
    expect(src).toContain('/api/mobile-link/generate')
    expect(src).toContain('startGoogleDriveConnect')
  })

  it('/settings/integrations keeps the Google Drive card and no removed providers', () => {
    const src = source('src/app/(app)/settings/integrations/page.tsx')
    expect(src).toContain('Google Drive')
    expect(src).not.toMatch(/OneDrive|Dropbox|Coming Soon/)
  })

  it('/settings/data keeps its export, import and destructive confirmation paths', () => {
    const src = source('src/app/(app)/settings/data/page.tsx')
    expect(src).toContain('/api/export?type=')
    expect(src).toContain('/api/import')
  })
})

describe('no page double-renders a title inside its content component', () => {
  // Both components rendered page-level headings until T072 gave their routes a
  // PageHeader; leaving them in place produced two "Search" / two "Calendar
  // Integrations" titles 24px apart.
  it('SearchPage does not render its own page heading', () => {
    const src = source('src/components/search/search-page.tsx')
    expect(src).not.toMatch(/<h1[\s>]/)
    expect(src).not.toMatch(/text-3xl|text-2xl font-bold/)
  })

  it('CalendarIntegrations does not render its own page heading', () => {
    const src = source('src/components/calendar/calendar-integrations.tsx')
    expect(src).not.toMatch(/<h1[\s>]|<h2[\s>]/)
    expect(src).not.toMatch(/text-3xl|text-2xl font-bold/)
  })
})
