import type { ApplicationStage } from '@/lib/db'
import { JOB_STAGE_TONE_CLASS } from '@/components/jobs/job-stage-tones'

/**
 * The jobs UI tracks a richer application pipeline (Interested / Interviewing /
 * Offer ...) than the Prisma `ApplicationStage` enum declares. Per ADR-002 we do
 * NOT change the schema: instead every UI stage id is mapped to the nearest
 * declared `ApplicationStage` on write, and back again on read.
 *
 * All stage wording and progress metadata lives here so components never hard-code
 * literals against the enum. The badge colour vocabulary is imported from
 * `@/components/jobs/job-stage-tones` rather than being written here: it is a set of
 * Tailwind utility literals, and Tailwind only emits utilities whose literals appear in
 * its content globs (ADR-011 tokens, T081).
 */

export type JobStageId =
  | 'INTERESTED'
  | 'APPLIED'
  | 'INTERVIEWING'
  | 'OFFER_RECEIVED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_DECLINED'
  | 'REJECTED'
  | 'WITHDRAWN'

export interface JobStageMeta {
  /** UI stage id used by the jobs pipeline components. */
  id: JobStageId
  /** Human-readable label. */
  label: string
  /** Nearest Prisma ApplicationStage value persisted for this stage. */
  stage: ApplicationStage
  /** Tailwind classes for the stage badge. */
  colorClass: string
  /** Completion percentage shown on the application progress bar. */
  progress: number
}

export const JOB_STAGES: readonly JobStageMeta[] = [
  { id: 'INTERESTED', label: 'Interested', stage: 'DISCOVERED', colorClass: JOB_STAGE_TONE_CLASS.INTERESTED, progress: 0 },
  { id: 'APPLIED', label: 'Applied', stage: 'APPLIED', colorClass: JOB_STAGE_TONE_CLASS.APPLIED, progress: 25 },
  { id: 'INTERVIEWING', label: 'Interviewing', stage: 'INTERVIEW', colorClass: JOB_STAGE_TONE_CLASS.INTERVIEWING, progress: 50 },
  { id: 'OFFER_RECEIVED', label: 'Offer Received', stage: 'DECISION', colorClass: JOB_STAGE_TONE_CLASS.OFFER_RECEIVED, progress: 75 },
  { id: 'OFFER_ACCEPTED', label: 'Offer Accepted', stage: 'ACCEPTED', colorClass: JOB_STAGE_TONE_CLASS.OFFER_ACCEPTED, progress: 100 },
  { id: 'OFFER_DECLINED', label: 'Offer Declined', stage: 'REJECTED', colorClass: JOB_STAGE_TONE_CLASS.OFFER_DECLINED, progress: 100 },
  { id: 'REJECTED', label: 'Rejected', stage: 'REJECTED', colorClass: JOB_STAGE_TONE_CLASS.REJECTED, progress: 100 },
  { id: 'WITHDRAWN', label: 'Withdrawn', stage: 'REJECTED', colorClass: JOB_STAGE_TONE_CLASS.WITHDRAWN, progress: 100 }
]

const JOB_STAGE_BY_ID: Record<JobStageId, JobStageMeta> = JOB_STAGES.reduce(
  (acc, meta) => {
    acc[meta.id] = meta
    return acc
  },
  {} as Record<JobStageId, JobStageMeta>
)

/** Progress lookup keyed by UI stage id. */
export const JOB_STAGE_PROGRESS: Record<JobStageId, number> = JOB_STAGES.reduce(
  (acc, meta) => {
    acc[meta.id] = meta.progress
    return acc
  },
  {} as Record<JobStageId, number>
)

/** Nearest UI stage id for a persisted ApplicationStage value. */
const JOB_STAGE_ID_BY_STAGE: Record<ApplicationStage, JobStageId> = {
  DISCOVERED: 'INTERESTED',
  RESEARCHING: 'INTERESTED',
  PREPARING: 'INTERESTED',
  READY: 'INTERESTED',
  APPLIED: 'APPLIED',
  INTERVIEW: 'INTERVIEWING',
  DECISION: 'OFFER_RECEIVED',
  ACCEPTED: 'OFFER_ACCEPTED',
  REJECTED: 'REJECTED'
}

export function getJobStage(id: JobStageId): JobStageMeta {
  return JOB_STAGE_BY_ID[id]
}

/** Map a UI stage id to the ApplicationStage value persisted in the database. */
export function toApplicationStage(id: JobStageId): ApplicationStage {
  return JOB_STAGE_BY_ID[id].stage
}

/** Map a persisted ApplicationStage value back to a UI stage id. */
export function toJobStageId(stage: ApplicationStage): JobStageId {
  return JOB_STAGE_ID_BY_STAGE[stage]
}
