import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import {
  errorReporting,
  ErrorCode,
  VaultAppError,
} from '@/lib/error-handling'
import { PageErrorBoundary } from '@/components/error/error-boundary'

// ---------------------------------------------------------------------------
// T061 - the error reporter must tolerate whatever a caller hands it.
//
// Before the fix, `errorReporting.report` was typed `(error: VaultAppError)` and
// called `error.toJSON()` unconditionally. The error boundary's only call passes
// a plain object literal (previously hidden behind an `as any`), so the call
// threw and the console got
//   Failed to report error: TypeError: e.toJSON is not a function
// instead of the report. These tests assert the property the boundary relies on.
// ---------------------------------------------------------------------------

let errorSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>

/** `true` when the reporter logged its own failure instead of reporting. */
function failedToReport(): boolean {
  return errorSpy.mock.calls.some((call) => String(call[0]).includes('Failed to report error'))
}

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('errorReporting.report', () => {
  it('tolerates an object literal (the shape the error boundary passes)', async () => {
    await expect(
      errorReporting.report({ code: 'INTERNAL_SERVER_ERROR', message: 'boom' } as never)
    ).resolves.toBeUndefined()

    expect(failedToReport()).toBe(false)
  })

  it('reports a real VaultAppError through toJSON()', async () => {
    await errorReporting.report(new VaultAppError(ErrorCode.RESOURCE_NOT_FOUND, 'gone'))

    const logged = logSpy.mock.calls.find((call) => call[0] === 'Reporting error:')
    expect(logged).toBeDefined()
    expect((logged?.[1] as { code?: unknown } | undefined)?.code).toBe(ErrorCode.RESOURCE_NOT_FOUND)
    expect(failedToReport()).toBe(false)
  })

  it('never throws and never reports its own failure for Error, string, null, undefined or {code}', async () => {
    const payloads: unknown[] = [new Error('plain'), 'a string', null, undefined, { code: 'X' }]

    for (const payload of payloads) {
      await expect(errorReporting.report(payload)).resolves.toBeUndefined()
    }

    expect(failedToReport()).toBe(false)
  })
})

describe('PageErrorBoundary wiring', () => {
  it('renders the fallback and does not fail while reporting the caught error', async () => {
    function Boom(): ReactElement {
      throw new Error('render boom')
    }

    render(createElement(PageErrorBoundary, { children: createElement(Boom) }))

    expect(await screen.findByText('Page Error')).toBeInTheDocument()
    expect(screen.getByText('render boom')).toBeInTheDocument()

    // React itself logs caught render errors to console.error, so assert only on
    // the substring the reporter uses - never on the call count.
    expect(failedToReport()).toBe(false)
  })
})
