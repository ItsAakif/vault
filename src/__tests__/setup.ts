// Global Vitest setup.
// Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveClass, etc.)
// on Vitest's `expect`.
import '@testing-library/jest-dom/vitest'
// One global async-utility budget for every `findBy*` / `waitFor` in the suite.
//
// Testing Library polls an async query until `asyncUtilTimeout` and only then throws, and its
// default is 1000 ms. That is too tight here: a `cloud-storage-google-only` assertion was measured
// at 991 ms against the 1000 ms default, so it passed or failed on machine load alone -- and this
// suite runs next to a live app on port 3000, which makes load the normal case rather than the
// exception.
//
// 5000 ms is 5x the observed worst case, and still 4x below the 20 s `testTimeout` in
// vitest.config.ts. Keeping it below the test timeout is the point: a genuine hang then surfaces
// as Testing Library's own "unable to find element" message, which names the failing query, instead
// of the opaque "Test timed out" that kills the file and dirties React's queue for later tests.
//
// `configure` is re-exported by @testing-library/react 16, which forwards every field except
// `reactStrictMode` to @testing-library/dom's config -- and `asyncUtilTimeout` lives there. This is
// a budget for the existing queries; it changes no assertion.
import { configure } from '@testing-library/react'

configure({ asyncUtilTimeout: 5000 })
