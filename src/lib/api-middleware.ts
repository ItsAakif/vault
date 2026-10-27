import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { handleApiError, VaultAppError, createError } from '@/lib/error-handling'
import { rateLimit, addSecurityHeaders } from '@/lib/security'
import { logger } from '@/lib/logger'
import { z } from 'zod'

// Middleware configuration
export interface ApiMiddlewareConfig {
  requireAuth?: boolean
  requirePermissions?: string[]
  rateLimit?: {
    windowMs: number
    maxRequests: number
  }
  validation?: {
    body?: z.ZodSchema
    query?: z.ZodSchema
    params?: z.ZodSchema
  }
  logging?: {
    logRequest?: boolean
    logResponse?: boolean
    logErrors?: boolean
  }
}

// Request context interface
export interface ApiContext {
  user?: {
    id: string
    email: string
    name?: string
  }
  requestId: string
  startTime: number
  ip: string
  userAgent: string
}

// Enhanced API handler type
export type ApiHandler = (
  request: NextRequest,
  context: ApiContext,
  params?: any
) => Promise<NextResponse>

// Main middleware wrapper
export function withApiMiddleware(
  handler: ApiHandler,
  config: ApiMiddlewareConfig = {}
) {
  return async (request: NextRequest, params?: any): Promise<NextResponse> => {
    const startTime = performance.now()
    const requestId = generateRequestId()
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    
    const context: ApiContext = {
      requestId,
      startTime,
      ip,
      userAgent
    }

    try {
      // 1. Security Headers
      let response = NextResponse.next()
      addSecurityHeaders(response)

      // 2. Rate Limiting
      if (config.rateLimit) {
        const rateLimitCheck = rateLimit(config.rateLimit)
        const rateLimitResponse = await rateLimitCheck(request)
        if (rateLimitResponse) {
          return addSecurityHeaders(rateLimitResponse)
        }
      }

      // 3. Authentication
      if (config.requireAuth) {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) {
          throw createError.unauthorized()
        }
        
        context.user = {
          id: session.user.id,
          email: session.user.email!,
          name: session.user.name || undefined
        }
      }

      // 4. Permission Checking
      if (config.requirePermissions && config.requirePermissions.length > 0) {
        if (!context.user) {
          throw createError.unauthorized()
        }
        
        // Check permissions (this would integrate with your permission system)
        const hasPermissions = await checkUserPermissions(
          context.user.id,
          config.requirePermissions
        )
        
        if (!hasPermissions) {
          throw createError.forbidden('Insufficient permissions')
        }
      }

      // 5. Input Validation
      if (config.validation) {
        await validateRequest(request, config.validation, params)
      }

      // 6. Request Logging
      if (config.logging?.logRequest !== false) {
        logger.info('API Request', {
          method: request.method,
          url: request.url,
          ip: context.ip,
          userAgent: context.userAgent,
          userId: context.user?.id
        }, {
          requestId: context.requestId,
          type: 'api_request'
        })
      }

      // 7. Execute Handler
      response = await handler(request, context, params)

      // 8. Response Logging
      const duration = performance.now() - startTime
      if (config.logging?.logResponse !== false) {
        logger.apiCall(
          request.method!,
          request.url,
          response.status,
          duration,
          {
            requestId: context.requestId,
            userId: context.user?.id
          }
        )
      }

      // 9. Add Security Headers to Response
      return addSecurityHeaders(response)

    } catch (error) {
      // Error Logging
      if (config.logging?.logErrors !== false) {
        logger.error('API Error', error, {
          requestId: context.requestId,
          method: request.method,
          url: request.url,
          userId: context.user?.id,
          duration: performance.now() - startTime
        })
      }

      // Handle and return error response
      return handleApiError(error, {
        path: request.url,
        method: request.method!,
        userId: context.user?.id
      })
    }
  }
}

// Validation helper
async function validateRequest(
  request: NextRequest,
  validation: NonNullable<ApiMiddlewareConfig['validation']>,
  params?: any
): Promise<void> {
  // Validate request body
  if (validation.body && ['POST', 'PUT', 'PATCH'].includes(request.method!)) {
    try {
      const body = await request.json()
      validation.body.parse(body)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createError.validation(
          error.issues.reduce((acc, err) => {
            acc[err.path.join('.')] = err.message
            return acc
          }, {} as Record<string, string>)
        )
      }
      throw createError.validation({}, 'Invalid request body')
    }
  }

  // Validate query parameters
  if (validation.query) {
    try {
      const url = new URL(request.url)
      const query = Object.fromEntries(url.searchParams.entries())
      validation.query.parse(query)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createError.validation(
          error.issues.reduce((acc, err) => {
            acc[err.path.join('.')] = err.message
            return acc
          }, {} as Record<string, string>)
        )
      }
      throw createError.validation({}, 'Invalid query parameters')
    }
  }

  // Validate route parameters
  if (validation.params && params) {
    try {
      validation.params.parse(params)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createError.validation(
          error.issues.reduce((acc, err) => {
            acc[err.path.join('.')] = err.message
            return acc
          }, {} as Record<string, string>)
        )
      }
      throw createError.validation({}, 'Invalid route parameters')
    }
  }
}

// Permission checking (mock implementation)
async function checkUserPermissions(
  userId: string,
  requiredPermissions: string[]
): Promise<boolean> {
  // This would integrate with your actual permission system
  // For now, return true for demo purposes
  return true
}

// Utility functions
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Convenience middleware creators
export const createApiRoute = {
  // Public route (no auth required)
  public: (handler: ApiHandler, config?: Omit<ApiMiddlewareConfig, 'requireAuth'>) =>
    withApiMiddleware(handler, { ...config, requireAuth: false }),

  // Protected route (auth required)
  protected: (handler: ApiHandler, config?: Omit<ApiMiddlewareConfig, 'requireAuth'>) =>
    withApiMiddleware(handler, { ...config, requireAuth: true }),

  // Admin route (auth + admin permissions)
  admin: (handler: ApiHandler, config?: Omit<ApiMiddlewareConfig, 'requireAuth'>) =>
    withApiMiddleware(handler, {
      ...config,
      requireAuth: true,
      requirePermissions: ['admin', ...(config?.requirePermissions || [])]
    }),

  // Rate limited route
  rateLimited: (
    handler: ApiHandler,
    rateLimit: { windowMs: number; maxRequests: number },
    config?: ApiMiddlewareConfig
  ) =>
    withApiMiddleware(handler, { ...config, rateLimit })
}

// Common validation schemas
export const commonValidation = {
  pagination: z.object({
    page: z.string().transform(Number).pipe(z.number().min(1)).optional(),
    limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional()
  }),

  id: z.object({
    id: z.string().min(1, 'ID is required')
  }),

  search: z.object({
    q: z.string().min(1, 'Search query is required'),
    type: z.string().optional(),
    category: z.string().optional()
  })
}

// Error handling utilities for specific scenarios
export const apiErrors = {
  notFound: (resource: string = 'Resource') =>
    createError.notFound(resource),

  unauthorized: (message?: string) =>
    createError.unauthorized(message),

  forbidden: (message?: string) =>
    createError.forbidden(message),

  validation: (errors: Record<string, string>) =>
    createError.validation(errors),

  conflict: (message: string, details?: any) =>
    createError.conflict(message, details),

  rateLimit: (retryAfter?: number) =>
    createError.rateLimit(retryAfter)
}

// Response helpers
export const apiResponse = {
  success: <T>(data: T, status: number = 200): NextResponse => {
    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    }, { status })
  },

  created: <T>(data: T): NextResponse => {
    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    }, { status: 201 })
  },

  noContent: (): NextResponse => {
    return new NextResponse(null, { status: 204 })
  },

  paginated: <T>(
    data: T[],
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  ): NextResponse => {
    return NextResponse.json({
      success: true,
      data,
      pagination,
      timestamp: new Date().toISOString()
    })
  }
}

// Async error wrapper for handlers
export function asyncHandler(handler: ApiHandler): ApiHandler {
  return async (request: NextRequest, context: ApiContext, params?: any) => {
    try {
      return await handler(request, context, params)
    } catch (error) {
      throw error // Let the middleware handle it
    }
  }
}