import type { JobStageId } from '@/lib/job-stages'

/**
 * The jobs pipeline's colour vocabulary, written only in ADR-011 semantic tokens.
 *
 * `signal` / `signal-subtle` mark a role that is moving through the funnel, `caution` marks a
 * decision that is waiting on the user, `positive` and `danger` mark the two terminal outcomes, and
 * the neutral `surface-sunken` ground marks a role that is not in motion at all (not applied yet, or
 * taken out of play). Related states share a hue family and are separated by weight or by ink, so a
 * stage reads as the same *kind* of state as its neighbour without collapsing into it.
 *
 * This table is a plain data module under `src/components/` rather than sitting beside the rest of
 * the stage metadata in `src/lib/job-stages.ts` for one measured reason: the content globs in
 * `tailwind.config.ts` cover `src/components`, `src/app` and `src/pages` but not `src/lib`, so a
 * utility that appears only in `src/lib` is never scanned and Tailwind emits no rule for it. That
 * is not hypothetical - while this scale lived in the lib, the Offer Accepted pair was invisible in
 * the browser because those two utilities appeared nowhere else in scanned source. The stage
 * metadata module imports this table, so every class still has exactly one definition.
 */
export const JOB_STAGE_TONE_CLASS: Record<JobStageId, string> = {
  // Not committed yet: a neutral ground, full ink, i.e. present but not in motion.
  INTERESTED: 'bg-surface-sunken text-ink',
  // In the funnel, first step: the accent at its lightest.
  APPLIED: 'bg-signal-subtle text-signal',
  // In the funnel, deepest step: the same accent, a weight deeper.
  INTERVIEWING: 'bg-signal/20 text-signal',
  // An offer is open and needs an answer: the one hue that means "attention".
  OFFER_RECEIVED: 'bg-caution/10 text-caution',
  // The good terminal outcome.
  OFFER_ACCEPTED: 'bg-positive/10 text-positive',
  // An offer that was resolved without acceptance: the warm ground stays (it *was* an offer) but the
  // alerting caution ink gives way to neutral ink - nothing is waiting on the user any more.
  OFFER_DECLINED: 'bg-caution/10 text-ink',
  // The bad terminal outcome.
  REJECTED: 'bg-danger/10 text-danger',
  // Taken out of play by the user: the same neutral ground as INTERESTED, faded ink.
  WITHDRAWN: 'bg-surface-sunken text-ink-faint'
}
