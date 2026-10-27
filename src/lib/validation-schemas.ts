import { z } from 'zod'

// Common validation patterns
const emailSchema = z.string().email('Please enter a valid email address')
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')

const urlSchema = z.string().url('Please enter a valid URL').optional().or(z.literal(''))

// User schemas
export const userRegistrationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name must be less than 50 characters'),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
})

export const userLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required')
})

export const userProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name must be less than 50 characters'),
  email: emailSchema,
  avatar: z.string().optional(),
  timezone: z.string().optional(),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional()
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmNewPassword: z.string()
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "New passwords don't match",
  path: ["confirmNewPassword"]
})

// Content schemas
export const contentItemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  content: z.string().min(1, 'Content is required'),
  type: z.enum(['IDEA', 'POETRY', 'NOTE', 'RESOURCE', 'PROJECT', 'JOB', 'DAILY', 'ARCHIVE', 'CUSTOM']),
  customTypeId: z.string().optional(), // For CUSTOM type items
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  categoryId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  archived: z.boolean().default(false),
  pinned: z.boolean().default(false),
  customFields: z.string().optional() // JSON string for custom field data
})

// Custom content type schema
export const customContentTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be less than 50 characters'),
  key: z.string().min(1, 'Key is required').max(30, 'Key must be less than 30 characters')
    .regex(/^[a-z0-9_]+$/, 'Key must contain only lowercase letters, numbers, and underscores'),
  description: z.string().max(200, 'Description must be less than 200 characters').optional(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Please enter a valid hex color').default('#3B82F6'),
  template: z.string().optional(), // JSON template
  fields: z.string().optional(), // JSON schema for custom fields
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0)
})

export const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(50, 'Category name must be less than 50 characters'),
  description: z.string().max(200, 'Description must be less than 200 characters').optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Please enter a valid hex color').default('#3B82F6'),
  icon: z.string().optional(),
  parentId: z.string().optional()
})

export const tagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(30, 'Tag name must be less than 30 characters'),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Please enter a valid hex color').default('#10B981'),
  description: z.string().max(100, 'Description must be less than 100 characters').optional(),
  parentId: z.string().optional()
})

// Project schemas
export const projectSchema = z.object({
  title: z.string().min(1, 'Project title is required').max(100, 'Title must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  content: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  status: z.enum(['PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'ON_HOLD']).default('PLANNING')
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return data.startDate <= data.endDate
  }
  return true
}, {
  message: "End date must be after start date",
  path: ["endDate"]
})

export const taskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(100, 'Title must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED']).default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  dueDate: z.date().optional(),
  estimatedHours: z.number().min(0, 'Estimated hours must be positive').optional(),
  actualHours: z.number().min(0, 'Actual hours must be positive').optional(),
  projectId: z.string().min(1, 'Project is required'),
  parentId: z.string().optional()
})

export const milestoneSchema = z.object({
  title: z.string().min(1, 'Milestone title is required').max(100, 'Title must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  dueDate: z.date(),
  status: z.enum(['PLANNING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('PLANNING'),
  projectId: z.string().min(1, 'Project is required')
})

// Job opportunity schemas
export const jobOpportunitySchema = z.object({
  title: z.string().min(1, 'Job title is required').max(100, 'Title must be less than 100 characters'),
  company: z.string().min(1, 'Company name is required').max(100, 'Company name must be less than 100 characters'),
  content: z.string().optional(),
  location: z.string().max(100, 'Location must be less than 100 characters').optional(),
  salary: z.string().max(50, 'Salary must be less than 50 characters').optional(),
  jobUrl: urlSchema,
  applicationDeadline: z.date().optional(),
  applicationStatus: z.enum([
    'DISCOVERED', 'RESEARCHING', 'PREPARING', 'READY', 'APPLIED', 
    'INTERVIEW', 'DECISION', 'ACCEPTED', 'REJECTED'
  ]).default('DISCOVERED'),
  matchPercentage: z.number().min(0).max(100).default(0),
  requiredSkills: z.string().optional(),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM')
})

// Calendar event schemas
export const calendarEventSchema = z.object({
  title: z.string().min(1, 'Event title is required').max(100, 'Title must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  startTime: z.date(),
  endTime: z.date(),
  allDay: z.boolean().default(false),
  recurring: z.string().optional(),
  reminders: z.string().optional(),
  location: z.string().max(200, 'Location must be less than 200 characters').optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Please enter a valid hex color').optional()
}).refine((data) => data.startTime < data.endTime, {
  message: "End time must be after start time",
  path: ["endTime"]
})

// Search schemas
export const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(200, 'Query must be less than 200 characters'),
  filters: z.object({
    contentTypes: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    dateRange: z.object({
      start: z.date().optional(),
      end: z.date().optional()
    }).optional(),
    priority: z.array(z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])).optional(),
    status: z.array(z.string()).optional()
  }).optional()
})

// Settings schemas
export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  language: z.string().default('en'),
  timezone: z.string().default('UTC'),
  notifications: z.object({
    email: z.boolean().default(true),
    push: z.boolean().default(true),
    inApp: z.boolean().default(true),
    digest: z.boolean().default(false),
    mentions: z.boolean().default(true)
  }).default({
    email: true,
    push: true,
    inApp: true,
    digest: false,
    mentions: true
  }),
  privacy: z.object({
    profileVisibility: z.enum(['public', 'private', 'team']).default('private'),
    activityTracking: z.boolean().default(true),
    dataCollection: z.boolean().default(true)
  }).default({
    profileVisibility: 'private',
    activityTracking: true,
    dataCollection: true
  })
})

// File upload schemas
export const fileUploadSchema = z.object({
  name: z.string().min(1, 'File name is required'),
  size: z.number().max(10 * 1024 * 1024, 'File size must be less than 10MB'), // 10MB limit
  type: z.string().min(1, 'File type is required'),
  contentItemId: z.string().optional()
})

// Collaboration schemas
export const shareSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  itemType: z.enum(['content', 'project', 'calendar']),
  email: emailSchema,
  permission: z.enum(['view', 'edit', 'admin']).default('view'),
  message: z.string().max(500, 'Message must be less than 500 characters').optional()
})

export const commentSchema = z.object({
  content: z.string().min(1, 'Comment content is required').max(1000, 'Comment must be less than 1000 characters'),
  itemId: z.string().min(1, 'Item ID is required'),
  itemType: z.enum(['content', 'project', 'task', 'calendar']),
  parentId: z.string().optional() // For threaded comments
})

// Export types for TypeScript
export type UserRegistration = z.infer<typeof userRegistrationSchema>
export type UserLogin = z.infer<typeof userLoginSchema>
export type UserProfile = z.infer<typeof userProfileSchema>
export type ChangePassword = z.infer<typeof changePasswordSchema>
export type ContentItem = z.infer<typeof contentItemSchema>
export type CustomContentType = z.infer<typeof customContentTypeSchema>
export type Category = z.infer<typeof categorySchema>
export type Tag = z.infer<typeof tagSchema>
export type Project = z.infer<typeof projectSchema>
export type Task = z.infer<typeof taskSchema>
export type Milestone = z.infer<typeof milestoneSchema>
export type JobOpportunity = z.infer<typeof jobOpportunitySchema>
export type CalendarEvent = z.infer<typeof calendarEventSchema>
export type Search = z.infer<typeof searchSchema>
export type UserPreferences = z.infer<typeof userPreferencesSchema>
export type FileUpload = z.infer<typeof fileUploadSchema>
export type Share = z.infer<typeof shareSchema>
export type Comment = z.infer<typeof commentSchema>

// Validation helper functions
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean
  data?: T
  errors?: Record<string, string>
} {
  try {
    const result = schema.parse(data)
    return { success: true, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {}
      error.issues.forEach((err) => {
        const path = err.path.join('.')
        errors[path] = err.message
      })
      return { success: false, errors }
    }
    return { success: false, errors: { general: 'Validation failed' } }
  }
}

// Custom validation rules
export const customValidators = {
  // Check if username is available
  usernameAvailable: async (username: string): Promise<boolean> => {
    // This would make an API call to check username availability
    return new Promise((resolve) => {
      setTimeout(() => resolve(!['admin', 'root', 'test'].includes(username.toLowerCase())), 500)
    })
  },
  
  // Check if email is available
  emailAvailable: async (email: string): Promise<boolean> => {
    // This would make an API call to check email availability
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 500)
    })
  },
  
  // Validate file type
  allowedFileTypes: (allowedTypes: string[]) => (file: File): boolean => {
    return allowedTypes.some(type => {
      if (type.includes('*')) {
        const baseType = type.split('/')[0]
        return file.type.startsWith(baseType)
      }
      return file.type === type
    })
  },
  
  // Validate image dimensions
  imageDimensions: (maxWidth: number, maxHeight: number) => (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(true) // Not an image, skip validation
        return
      }
      
      const img = new Image()
      img.onload = () => {
        resolve(img.width <= maxWidth && img.height <= maxHeight)
      }
      img.onerror = () => resolve(false)
      img.src = URL.createObjectURL(file)
    })
  }
}