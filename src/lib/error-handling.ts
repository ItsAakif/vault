import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

// Standard error types for Vault
export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Resource Management
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  
  // Rate Limiting & Quotas
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // File & Upload
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  
  // Database & System
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  // Business Logic
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  
  // Sync & Collaboration
  SYNC_CONFLICT = 'SYNC_CONFLICT',
  CONCURRENT_MODIFICATION = 'CONCURRENT_MODIFICATION',
  OFFLINE_ERROR = 'OFFLINE_ERROR'
}

// Standard error interface
export interface VaultError {
  code: ErrorCode
  message: string
  details?: any
  timestamp: Date
  requestId?: string
  userId?: string
  path?: string
  method?: string
  stack?: string
  recoveryActions?: RecoveryAction[]
}

export interface RecoveryAction {
  label: string
  action: string
  type: 'retry' | 'refresh' | 'navigate' | 'contact_support' | 'custom'
  data?: any
}

// Custom error class
export class VaultAppError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly details?: any
  public readonly recoveryActions?: RecoveryAction[]
  public readonly timestamp: Date
  public readonly requestId?: string

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    details?: any,
    recoveryActions?: RecoveryAction[]
  ) {
    super(message)
    this.name = 'VaultAppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
    this.recoveryActions = recoveryActions
    this.timestamp = new Date()
    this.requestId = generateRequestId()

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VaultAppError)
    }
  }

  toJSON(): VaultError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
      stack: this.stack,
      recoveryActions: this.recoveryActions
    }
  }
}

// Error factory functions
export const createError = {
  unauthorized: (message = 'Authentication required'): VaultAppError =>
    new VaultAppError(ErrorCode.UNAUTHORIZED, message, 401, null, [
      { label: 'Sign In', action: '/auth/signin', type: 'navigate' },
      { label: 'Refresh Page', action: 'refresh', type: 'refresh' }
    ]),

  forbidden: (message = 'Access denied'): VaultAppError =>
    new VaultAppError(ErrorCode.FORBIDDEN, message, 403, null, [
      { label: 'Contact Support', action: 'contact_support', type: 'contact_support' },
      { label: 'Go Back', action: 'back', type: 'navigate' }
    ]),

  validation: (details: any, message = 'Validation failed'): VaultAppError =>
    new VaultAppError(ErrorCode.VALIDATION_ERROR, message, 400, details, [
      { label: 'Fix Errors', action: 'fix_validation', type: 'custom' }
    ]),

  notFound: (resource = 'Resource', message?: string): VaultAppError =>
    new VaultAppError(
      ErrorCode.RESOURCE_NOT_FOUND,
      message || `${resource} not found`,
      404,
      { resource },
      [
        { label: 'Go Back', action: 'back', type: 'navigate' },
        { label: 'Go Home', action: '/', type: 'navigate' }
      ]
    ),

  conflict: (message = 'Resource conflict', details?: any): VaultAppError =>
    new VaultAppError(ErrorCode.RESOURCE_CONFLICT, message, 409, details, [
      { label: 'Retry', action: 'retry', type: 'retry' },
      { label: 'Refresh', action: 'refresh', type: 'refresh' }
    ]),

  rateLimit: (retryAfter?: number): VaultAppError =>
    new VaultAppError(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      'Too many requests. Please try again later.',
      429,
      { retryAfter },
      [
        { 
          label: `Retry in ${retryAfter || 60}s`, 
          action: 'retry_after', 
          type: 'retry',
          data: { delay: (retryAfter || 60) * 1000 }
        }
      ]
    ),

  fileTooBig: (maxSize: number): VaultAppError =>
    new VaultAppError(
      ErrorCode.FILE_TOO_LARGE,
      `File size exceeds maximum limit of ${formatFileSize(maxSize)}`,
      413,
      { maxSize },
      [
        { label: 'Choose Smaller File', action: 'choose_file', type: 'custom' },
        { label: 'Compress File', action: 'compress_help', type: 'custom' }
      ]
    ),

  syncConflict: (conflictData: any): VaultAppError =>
    new VaultAppError(
      ErrorCode.SYNC_CONFLICT,
      'Changes conflict with recent updates',
      409,
      conflictData,
      [
        { label: 'Resolve Conflicts', action: 'resolve_conflicts', type: 'custom' },
        { label: 'Discard Changes', action: 'discard_changes', type: 'custom' },
        { label: 'Keep Both Versions', action: 'keep_both', type: 'custom' }
      ]
    ),

  database: (originalError: Error): VaultAppError =>
    new VaultAppError(
      ErrorCode.DATABASE_ERROR,
      'Database operation failed',
      500,
      { originalError: originalError.message },
      [
        { label: 'Retry', action: 'retry', type: 'retry' },
        { label: 'Contact Support', action: 'contact_support', type: 'contact_support' }
      ]
    ),

  external: (service: string, originalError?: Error): VaultAppError =>
    new VaultAppError(
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      `External service (${service}) is unavailable`,
      503,
      { service, originalError: originalError?.message },
      [
        { label: 'Retry', action: 'retry', type: 'retry' },
        { label: 'Try Later', action: 'try_later', type: 'custom' }
      ]
    )
}

// Error handler for API routes
export function handleApiError(error: unknown, context?: {
  path?: string
  method?: string
  userId?: string
}): NextResponse {
  let vaultError: VaultAppError

  if (error instanceof VaultAppError) {
    vaultError = error
  } else if (error instanceof ZodError) {
    const validationErrors = error.issues.reduce((acc, err) => {
      const field = err.path.join('.')
      acc[field] = err.message
      return acc
    }, {} as Record<string, string>)

    vaultError = createError.validation(validationErrors)
  } else if (error instanceof Error) {
    // Handle known error types
    if (error.message.includes('Unique constraint')) {
      vaultError = new VaultAppError(
        ErrorCode.RESOURCE_ALREADY_EXISTS,
        'Resource already exists',
        409,
        { originalError: error.message }
      )
    } else if (error.message.includes('Foreign key constraint')) {
      vaultError = createError.validation(
        { dependency: 'Referenced resource does not exist' },
        'Invalid reference'
      )
    } else {
      vaultError = new VaultAppError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        'An unexpected error occurred',
        500,
        { originalError: error.message }
      )
    }
  } else {
    vaultError = new VaultAppError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'An unexpected error occurred',
      500
    )
  }

  // Add context information
  if (context) {
    Object.assign(vaultError, { requestId: generateRequestId() }, context)
  }

  // Log the error
  logError(vaultError, context)

  // Return appropriate response
  return NextResponse.json(
    {
      error: {
        code: vaultError.code,
        message: vaultError.message,
        details: vaultError.details,
        timestamp: vaultError.timestamp,
        requestId: vaultError.requestId,
        recoveryActions: vaultError.recoveryActions
      }
    },
    { status: vaultError.statusCode }
  )
}

// Error boundary component props
export interface ErrorBoundaryState {
  hasError: boolean
  error?: VaultError
  errorInfo?: any
}

// Utility functions
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  if (bytes === 0) return '0 Bytes'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

// Error logging function
function logError(error: VaultAppError, context?: any) {
  const logData = {
    timestamp: error.timestamp,
    requestId: error.requestId,
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
    details: error.details,
    stack: error.stack,
    context
  }

  // In development, log to console
  if (process.env.NODE_ENV === 'development') {
    console.error('🚨 Vault Error:', logData)
  }

  // In production, you would send to logging service
  // Example: sendToLoggingService(logData)
}

// Error reporting utilities

/**
 * T061: normalise whatever a caller hands to `errorReporting.report` into a
 * `VaultError`. Before this existed, `report` was typed `(error: VaultAppError)`
 * and called `error.toJSON()` unconditionally; its only caller passed a plain
 * object literal (with an `as any` cast to make that compile), so the call threw
 * and the boundary reported `Failed to report error: e.toJSON is not a function`
 * instead of the error it had caught.
 *
 * The signature of `report` is `unknown` so the contract matches reality, and
 * this is the one place that classifies the payload.
 */
function toReportable(error: unknown): VaultError {
  if (error instanceof VaultAppError) return error.toJSON()
  if (error instanceof Error) {
    return {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: error.message,
      details: null,
      timestamp: new Date(),
      requestId: undefined,
      stack: error.stack,
      recoveryActions: []
    }
  }
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { toJSON?: unknown }
    if (typeof maybe.toJSON === 'function') {
      return (maybe as { toJSON: () => VaultError }).toJSON()
    }
    const record = error as Record<string, unknown>
    return {
      code: (record.code as ErrorCode) ?? ErrorCode.INTERNAL_SERVER_ERROR,
      message: typeof record.message === 'string' ? record.message : JSON.stringify(record),
      details: record.details ?? null,
      timestamp: record.timestamp instanceof Date ? record.timestamp : new Date(),
      requestId: typeof record.requestId === 'string' ? record.requestId : undefined,
      stack: typeof record.stack === 'string' ? record.stack : undefined,
      recoveryActions: []
    }
  }
  return {
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message: String(error),
    details: null,
    timestamp: new Date(),
    requestId: undefined,
    stack: undefined,
    recoveryActions: []
  }
}

export const errorReporting = {
  // Report error to external service
  report: async (error: unknown, additionalContext?: unknown) => {
    try {
      // This would integrate with services like Sentry, LogRocket, etc.
      console.log('Reporting error:', toReportable(error), additionalContext)
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError)
    }
  },

  // Track error metrics
  track: (error: VaultAppError) => {
    // This would integrate with analytics services
    console.log('Tracking error metric:', error.code)
  }
}

// Retry utilities
export const retryUtils = {
  withRetry: async <T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    backoff: number = 2
  ): Promise<T> => {
    let lastError: Error

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error
        
        if (attempt === maxRetries) {
          throw lastError
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(backoff, attempt - 1)))
      }
    }

    throw lastError!
  },

  isRetryable: (error: VaultAppError): boolean => {
    const retryableCodes = [
      ErrorCode.DATABASE_ERROR,
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      ErrorCode.SERVICE_UNAVAILABLE,
      ErrorCode.RATE_LIMIT_EXCEEDED
    ]
    return retryableCodes.includes(error.code)
  }
}

// Error context provider for React components
export interface ErrorContextValue {
  reportError: (error: Error, context?: any) => void
  clearError: () => void
  lastError?: VaultError
}

// Validation helpers
export const validationHelpers = {
  formatZodError: (error: ZodError): Record<string, string> => {
    return error.issues.reduce((acc, err) => {
      const field = err.path.join('.')
      acc[field] = err.message
      return acc
    }, {} as Record<string, string>)
  },

  createFieldError: (field: string, message: string): VaultAppError => {
    return createError.validation({ [field]: message }, `Invalid ${field}`)
  }
}