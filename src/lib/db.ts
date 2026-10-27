import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Export Prisma enums for use in API routes
export {
  ContentType,
  ContentStatus,
  Priority,
  ProjectStatus,
  TaskStatus,
  MilestoneStatus,
  ResourceType,
  ApplicationStage,
  WorkspaceRole,
  NotificationType,
  ActivityType,
  CollaboratorRole,
  ShareType,
  Permission,
  IntegrationType,
  BackupType,
  BackupStatus,
  TaskDependencyType
} from '@prisma/client'

// Export types
export type {
  User,
  UserPreferences,
  Category,
  Tag,
  ContentItem,
  ContentVersion,
  File,
  Project,
  Task,
  Milestone,
  ResourceLink,
  JobOpportunity,
  Skill,
  CalendarEvent,
  Workspace,
  WorkspaceMember,
  UserAnalytics,
  Notification,
  Activity,
  PresenceSession,
  ProjectCollaborator,
  ProjectAnalytics,
  TimeEntry,
  Comment,
  Share,
  SearchIndex,
  Integration,
  Backup,
  ProjectTemplate,
  DocumentLock,
  ProjectGoal,
  TaskDependency
} from '@prisma/client'