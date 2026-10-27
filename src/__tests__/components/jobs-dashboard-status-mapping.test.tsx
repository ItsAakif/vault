import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// The dashboard only needs the toast provider on failure paths; the API is stubbed per test.
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import { JobsDashboard, resolveJobStage } from '@/components/jobs/jobs-dashboard'
import { JOB_STAGE_PROGRESS } from '@/lib/job-stages'

/**
 * The bug this pins: `/api/jobs` returns `status` as a `JobStageId` (`APPLIED`, `OFFER_RECEIVED`,
 * ...), but the dashboard only knew the legacy lowercase words, so every lookup missed and every
 * role rendered as Interested - including the stat cards, which read `Interested: 3, Applied: 0`.
 *
 * The stage mapping is asserted twice: directly on `resolveJobStage` (the two vocabularies, the
 * case-insensitive match, the degraded unknown value) and through the rendered dashboard, because
 * a correct mapper that the component does not use is still "every job is Interested".
 */

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone: () => jsonResponse(status, body),
  } as Response
}

/** The API's real row shape. `status` is a stage id today; a legacy row carries a lowercase word. */
function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    title: 'Frontend engineer',
    company: 'Kestrel',
    description: '',
    status: 'APPLIED',
    salary: '',
    location: '',
    url: '',
    dateApplied: '2026-01-01T00:00:00.000Z',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

/** A stat card by its title. `CardTitle` renders `data-slot="card-title"`, so "Applied" is unambiguous. */
function statCard(title: string): HTMLElement {
  return screen
    .getByText(title, { selector: '[data-slot="card-title"]' })
    .closest('[data-slot="card"]') as HTMLElement
}

/** The card of one role, addressed by its title. */
function jobCard(title: string): HTMLElement {
  return screen.getByText(title).closest('[data-slot="card"]') as HTMLElement
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('resolveJobStage', () => {
  it('recognises the API stage ids, case-insensitively', () => {
    expect(resolveJobStage('OFFER_RECEIVED')).toBe('OFFER_RECEIVED')
    expect(resolveJobStage('APPLIED')).toBe('APPLIED')
    expect(resolveJobStage('offer_received')).toBe('OFFER_RECEIVED')
    expect(resolveJobStage('Interested')).toBe('INTERESTED')
  })

  it('still maps the legacy lowercase vocabulary', () => {
    expect(resolveJobStage('applied')).toBe('APPLIED')
    expect(resolveJobStage('interview')).toBe('INTERVIEWING')
    expect(resolveJobStage('offered')).toBe('OFFER_RECEIVED')
    expect(resolveJobStage('accepted')).toBe('OFFER_ACCEPTED')
    expect(resolveJobStage('declined')).toBe('OFFER_DECLINED')
    expect(resolveJobStage('rejected')).toBe('REJECTED')
  })

  it('degrades an unknown or missing value to INTERESTED', () => {
    expect(resolveJobStage('something-else')).toBe('INTERESTED')
    expect(resolveJobStage('')).toBe('INTERESTED')
    expect(resolveJobStage(undefined)).toBe('INTERESTED')
    expect(resolveJobStage(null)).toBe('INTERESTED')
  })
})

describe('the jobs dashboard renders the status the API returned', () => {
  it('shows an OFFER_RECEIVED job as Offer Received and counts it in Offers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, [
          job({ id: 'job-offer', title: 'Frontend engineer', company: 'Kestrel', status: 'OFFER_RECEIVED' }),
          job({ id: 'job-applied', title: 'Platform engineer', company: 'Meridian', status: 'APPLIED' }),
        ])
      )
    )

    render(<JobsDashboard />)

    expect(await screen.findByText('Frontend engineer')).toBeInTheDocument()
    expect(screen.getByText('Platform engineer')).toBeInTheDocument()

    // The badge reads the stage's own label, not the raw id.
    expect(within(jobCard('Frontend engineer')).getByText('Offer Received')).toBeInTheDocument()
    expect(within(jobCard('Platform engineer')).getByText('Applied')).toBeInTheDocument()

    // The progress bar follows the same stage.
    expect(
      within(jobCard('Frontend engineer')).getByText(`${JOB_STAGE_PROGRESS.OFFER_RECEIVED}%`)
    ).toBeInTheDocument()

    // `Total 2, Interested 0, Applied 1, Offers 1` - the reported bug was `Interested: 3, Applied: 0`.
    expect(within(statCard('Total')).getByText('2')).toBeInTheDocument()
    expect(within(statCard('Interested')).getByText('0')).toBeInTheDocument()
    expect(within(statCard('Applied')).getByText('1')).toBeInTheDocument()
    expect(within(statCard('Offers')).getByText('1')).toBeInTheDocument()
    expect(within(statCard('Rejected')).getByText('0')).toBeInTheDocument()
  })

  it('maps a legacy lowercase record and leaves a genuinely unknown status as Interested', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, [
          job({ id: 'job-legacy', title: 'Legacy record', company: 'Old client', status: 'applied' }),
          job({ id: 'job-unknown', title: 'Unknown record', company: 'No vocabulary', status: 'archived-ish' }),
        ])
      )
    )

    render(<JobsDashboard />)

    expect(await screen.findByText('Legacy record')).toBeInTheDocument()

    // The legacy word still reaches APPLIED...
    expect(within(jobCard('Legacy record')).getByText('Applied')).toBeInTheDocument()
    // ...and an unknown value is Interested, not dropped and not an error.
    expect(within(jobCard('Unknown record')).getByText('Interested')).toBeInTheDocument()

    expect(within(statCard('Total')).getByText('2')).toBeInTheDocument()
    expect(within(statCard('Applied')).getByText('1')).toBeInTheDocument()
    expect(within(statCard('Interested')).getByText('1')).toBeInTheDocument()
  })
})
