import { logger } from '@/lib/logger'

/**
 * Production Logging Configuration
 * 
 * This configuration sets up structured logging for production environments
 * while maintaining development-friendly console logging in dev mode.
 */

// Environment-specific logging configuration
const isProduction = process.env.NODE_ENV === 'production'
const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'

// Log levels based on environment
const LOG_LEVELS = {
  development: ['debug', 'info', 'warn', 'error'],
  production: ['info', 'warn', 'error'],
  test: ['error']
} as const

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type Environment = keyof typeof LOG_LEVELS

/**
 * Production-safe logging service
 */
class ProductionLogger {
  private environment: Environment
  private allowedLevels: LogLevel[]
  private sessionId: string
  private userId?: string

  constructor() {
    this.environment = (process.env.NODE_ENV as Environment) || 'development'
    this.allowedLevels = [...LOG_LEVELS[this.environment]]
    this.sessionId = this.generateSessionId()
  }

  /**
   * Set user context for logging
   */
  setUser(userId: string, userEmail?: string): void {
    this.userId = userId
    if (isProduction) {
      // In production, use the proper logger
      logger.info('User context set for logging', {
        userId,
        userEmail: userEmail ? this.maskEmail(userEmail) : undefined,
        sessionId: this.sessionId
      })
    }
  }

  /**
   * Debug level logging - development only
   */
  debug(message: string, context?: any): void {
    if (!this.shouldLog('debug')) return

    if (isDevelopment) {
      console.debug(`🔍 [DEBUG] ${message}`, context || '')
    }
  }

  /**
   * Info level logging
   */
  info(message: string, context?: any): void {
    if (!this.shouldLog('info')) return

    if (isDevelopment) {
      console.info(`ℹ️ [INFO] ${message}`, context || '')
    } else if (isProduction) {
      logger.info(message, {
        ...this.getBaseContext(),
        ...context
      })
    }
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: any): void {
    if (!this.shouldLog('warn')) return

    if (isDevelopment) {
      console.warn(`⚠️ [WARN] ${message}`, context || '')
    } else if (isProduction) {
      logger.warn(message, {
        ...this.getBaseContext(),
        ...context
      })
    }
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error | any, context?: any): void {
    if (!this.shouldLog('error')) return

    const errorDetails = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error

    if (isDevelopment) {
      console.error(`❌ [ERROR] ${message}`, errorDetails, context || '')
    } else if (isProduction) {
      logger.error(message, {
        ...this.getBaseContext(),
        error: errorDetails,
        ...context
      })
    }
  }

  /**
   * API request logging
   */
  apiRequest(method: string, url: string, status?: number, duration?: number): void {
    const message = `API ${method} ${url}`
    const context = {
      method,
      url: this.sanitizeUrl(url),
      status,
      duration,
      type: 'api_request'
    }

    if (status && status >= 400) {
      this.warn(message, context)
    } else {
      this.info(message, context)
    }
  }

  /**
   * User action logging
   */
  userAction(action: string, details?: any): void {
    this.info(`User action: ${action}`, {
      action,
      details,
      type: 'user_action'
    })
  }

  /**
   * Performance logging
   */
  performance(metric: string, value: number, unit: 'ms' | 'bytes' | 'count' = 'ms'): void {
    this.info(`Performance: ${metric}`, {
      metric,
      value,
      unit,
      type: 'performance'
    })
  }

  /**
   * Feature usage logging
   */
  featureUsage(feature: string, action: string, metadata?: any): void {
    this.info(`Feature usage: ${feature} - ${action}`, {
      feature,
      action,
      metadata,
      type: 'feature_usage'
    })
  }

  /**
   * Security event logging
   */
  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', details?: any): void {
    const message = `Security event: ${event}`
    const context = {
      event,
      severity,
      details,
      type: 'security'
    }

    if (severity === 'critical' || severity === 'high') {
      this.error(message, undefined, context)
    } else {
      this.warn(message, context)
    }
  }

  /**
   * Business logic logging
   */
  business(event: string, data?: any): void {
    this.info(`Business event: ${event}`, {
      event,
      data,
      type: 'business'
    })
  }

  /**
   * Check if we should log at this level
   */
  private shouldLog(level: LogLevel): boolean {
    return this.allowedLevels.includes(level)
  }

  /**
   * Get base context for all logs
   */
  private getBaseContext(): any {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      environment: this.environment,
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Mask sensitive information in email
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@')
    if (!local || !domain) return '***@***.***'
    
    const maskedLocal = local.length > 2 
      ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
      : '***'
    
    return `${maskedLocal}@${domain}`
  }

  /**
   * Sanitize URLs to remove sensitive parameters
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url, 'http://localhost')
      
      // Remove sensitive query parameters
      const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth', 'api_key']
      sensitiveParams.forEach(param => {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.set(param, '***')
        }
      })
      
      return urlObj.pathname + urlObj.search
    } catch {
      return url.split('?')[0] // Fallback to just pathname
    }
  }

  /**
   * Flush logs (useful for testing)
   */
  flush(): void {
    if (isProduction) {
      // In production, this would flush any queued logs
      logger.info('Log flush requested')
    }
  }
}

// Create and export singleton instance
export const prodLogger = new ProductionLogger()

// Convenience exports for different log types
export const log = {
  debug: (message: string, context?: any) => prodLogger.debug(message, context),
  info: (message: string, context?: any) => prodLogger.info(message, context),
  warn: (message: string, context?: any) => prodLogger.warn(message, context),
  error: (message: string, error?: Error | any, context?: any) => prodLogger.error(message, error, context),
  
  // Specialized logging methods
  api: (method: string, url: string, status?: number, duration?: number) => 
    prodLogger.apiRequest(method, url, status, duration),
  
  user: (action: string, details?: any) => prodLogger.userAction(action, details),
  
  perf: (metric: string, value: number, unit?: 'ms' | 'bytes' | 'count') => 
    prodLogger.performance(metric, value, unit),
  
  feature: (feature: string, action: string, metadata?: any) => 
    prodLogger.featureUsage(feature, action, metadata),
  
  security: (event: string, severity: 'low' | 'medium' | 'high' | 'critical', details?: any) => 
    prodLogger.security(event, severity, details),
  
  business: (event: string, data?: any) => prodLogger.business(event, data),
  
  setUser: (userId: string, userEmail?: string) => prodLogger.setUser(userId, userEmail)
}

// Default export
export default prodLogger

/**
 * Usage Examples:
 * 
 * // Basic logging
 * log.info('User logged in', { userId: '123' })
 * log.error('Database connection failed', error)
 * 
 * // API logging
 * log.api('POST', '/api/users', 201, 150)
 * 
 * // User actions
 * log.user('button_click', { button: 'save', page: 'profile' })
 * 
 * // Performance
 * log.perf('page_load', 1200, 'ms')
 * 
 * // Feature usage
 * log.feature('kanban_board', 'task_moved', { from: 'todo', to: 'done' })
 * 
 * // Security events
 * log.security('failed_login_attempt', 'medium', { ip: '192.168.1.1' })
 * 
 * // Business events
 * log.business('project_created', { projectId: 'proj_123', teamSize: 5 })
 */