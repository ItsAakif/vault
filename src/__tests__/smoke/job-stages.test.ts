/**
 * Smoke test: UI job-stage <-> Prisma `ApplicationStage` mapping.
 *
 * BLOCKED (T022/T023 note): the subject module `src/lib/job-stages.ts` does NOT
 * exist in this repo state. T023 calls this test "guards T011's mapping", and T011
 * ("add src/lib/job-stages.ts exporting a mapping between UI stage ids and the
 * schema's ApplicationStage ... and change the call sites to use the mapping") is
 * not implemented - the jobs UI still uses the undeclared literal pipeline
 * (INTERESTED / INTERVIEWING / OFFER_RECEIVED / ...).
 *
 * Per the Wave 4 instruction ("If any test cannot be made to pass without touching
 * application behaviour outside scope, mark it skipped with a reason and report it")
 * this suite is skipped rather than making it pass by adding out-of-scope application
 * code.
 *
 * The specifier is held in a variable on purpose: a literal `@/lib/job-stages` import
 * fails Vite's static import analysis even inside describe.skip. When T011 lands:
 * remove `.skip`, inline the literal specifier, and assert the mapping.
 */
import { describe, it, expect } from 'vitest'

const JOB_STAGES_MODULE = '@/lib/job-stages'

describe.skip('smoke: job stage mapping (BLOCKED on T011 - src/lib/job-stages.ts missing)', () => {
  it('maps UI stage ids to ApplicationStage and is total + round-trips', async () => {
    const jobStages = await import(/* @vite-ignore */ JOB_STAGES_MODULE)

    expect(Object.keys(jobStages).length).toBeGreaterThan(0)
  })
})
