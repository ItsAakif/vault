import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// Timeout budget for this machine, not an arbitrary number.
//
// Vitest's 5000 ms default is wrong here. Several suites mount whole pages, and this box also
// serves the built app on port 3000, so a full run collects for ~170 s while tests execute. A test
// killed at 5000 ms dies mid-`act()`, which leaves React's work queue dirty and makes the *later*
// tests in that file see an empty DOM -- one slow test then reads as a cascade of failures in a
// file that passes when run alone. Observed 2026-10-18, with a different file failing each run:
// app-shell, cloud-storage-google-only, calendar-view-drive-notice, use-markdown-editor.
//
// 20 s is a ceiling, deliberately not higher. The slowest legitimate test in the suite settles in
// roughly 1-10 s under load, so 20 s keeps ~2x headroom while a test that needs more than that is
// hanging, and a hang must fail loudly instead of being masked. Sibling work already hardened
// use-markdown-editor.test.tsx with the same 20 s figure, so this is the suite-wide form of a
// value already proven in one file.
//
// hookTimeout is raised with it: a hook overrunning its own 10 s default aborts the file the same
// way, so leaving it lower would keep a second, quieter source of cascades alive.
export default defineConfig({
  plugins: [react(), tsconfigPaths({ root: '.' })],
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'mobile/**', '.next/**'],
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
  },
})
