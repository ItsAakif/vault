// Comprehensive logging system for Vault Command Center

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  timestamp: Date
  level: LogLevel
  message: string
  context?: any
  userId?: string
  sessionId?: string
  requestId?: string
  component?: string
  action?: string
  duration?: number
  metadata?: Record<string, any>
  stack?: string
}

export interface LoggerConfig {
  level: LogLevel
  enableConsole: boolean
  enableStorage: boolean
  enableRemote: boolean
  maxStorageEntries: number
  remoteEndpoint?: string
  sensitiveFields: string[]
}

class VaultLogger {
  private config: LoggerConfig
  private buffer: LogEntry[] = []
  private sessionId: string
  private isClient: boolean

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
      enableConsole: true,
      enableStorage: typeof window !== 'undefined',
      enableRemote: process.env.NODE_ENV === 'production',
      maxStorageEntries: 1000,
      sensitiveFields: ['password', 'token', 'apiKey', 'secret', 'credentials'],
      ...config
    }

    this.sessionId = this.generateSessionId()
    this.isClient = typeof window !== 'undefined'

    // Initialize storage cleanup
    if (this.isClient && this.config.enableStorage) {
      this.cleanupOldLogs()
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level
  }

  private sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') return data

    const sanitized = Array.isArray(data) ? [...data] : { ...data }

    for (const [key, value] of Object.entries(sanitized)) {
      if (this.config.sensitiveFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeData(value)
      }
    }

    return sanitized
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: any,
    metadata?: Record<string, any>
  ): LogEntry {
    return {
      timestamp: new Date(),
      level,
      message,
      context: context ? this.sanitizeData(context) : undefined,
      sessionId: this.sessionId,
      metadata: metadata ? this.sanitizeData(metadata) : undefined,
      ...(this.isClient && {
        userId: this.getCurrentUserId(),
        component: this.getCurrentComponent()
      })
    }
  }

  private getCurrentUserId(): string | undefined {
    // This would integrate with your auth system
    if (this.isClient) {
      try {
        const user = localStorage.getItem('user')
        return user ? JSON.parse(user).id : undefined
      } catch {
        return undefined
      }
    }
    return undefined
  }

  private getCurrentComponent(): string | undefined {
    if (this.isClient) {
      return window.location.pathname
    }
    return undefined
  }

  private writeToConsole(entry: LogEntry): void {
    if (!this.config.enableConsole) return

    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
    const levelColors = [
      'color: #6B7280', // DEBUG - gray
      'color: #3B82F6', // INFO - blue
      'color: #F59E0B', // WARN - yellow
      'color: #EF4444', // ERROR - red
      'color: #DC2626; font-weight: bold' // FATAL - dark red, bold
    ]

    const timestamp = entry.timestamp.toISOString()
    const level = levelNames[entry.level]
    const prefix = `[${timestamp}] [${level}]`

    const logMethod = entry.level >= LogLevel.ERROR ? 'error' :
                     entry.level >= LogLevel.WARN ? 'warn' :
                     'log'

    if (entry.context || entry.metadata) {
      console[logMethod](
        `%c${prefix} ${entry.message}`,
        levelColors[entry.level],
        {
          ...(entry.context && { context: entry.context }),
          ...(entry.metadata && { metadata: entry.metadata }),
          ...(entry.stack && { stack: entry.stack })
        }
      )
    } else {
      console[logMethod](`%c${prefix} ${entry.message}`, levelColors[entry.level])
    }
  }

  private writeToStorage(entry: LogEntry): void {
    if (!this.config.enableStorage || !this.isClient) return

    try {
      const stored = localStorage.getItem('vault_logs')
      const logs: LogEntry[] = stored ? JSON.parse(stored) : []
      
      logs.push(entry)
      
      // Keep only the most recent entries
      if (logs.length > this.config.maxStorageEntries) {
        logs.splice(0, logs.length - this.config.maxStorageEntries)
      }
      
      localStorage.setItem('vault_logs', JSON.stringify(logs))
    } catch (error) {
      console.warn('Failed to write log to storage:', error)
    }
  }

  private async writeToRemote(entry: LogEntry): Promise<void> {
    if (!this.config.enableRemote || !this.config.remoteEndpoint) return

    try {
      await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(entry)
      })
    } catch (error) {
      // Fail silently for remote logging to avoid infinite loops
      if (this.config.enableConsole) {
        console.warn('Failed to send log to remote endpoint:', error)
      }
    }
  }

  private log(level: LogLevel, message: string, context?: any, metadata?: Record<string, any>): void {
    if (!this.shouldLog(level)) return

    const entry = this.createLogEntry(level, message, context, metadata)

    // Add to buffer for batch processing
    this.buffer.push(entry)

    // Write to outputs
    this.writeToConsole(entry)
    this.writeToStorage(entry)
    
    // Remote logging is async and non-blocking
    if (this.config.enableRemote) {
      this.writeToRemote(entry).catch(() => {
        // Ignore remote logging errors
      })
    }

    // Process buffer periodically
    if (this.buffer.length >= 10) {
      this.flush()
    }
  }

  // Public logging methods
  debug(message: string, context?: any, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context, metadata)
  }

  info(message: string, context?: any, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context, metadata)
  }

  warn(message: string, context?: any, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context, metadata)
  }

  error(message: string, error?: Error | any, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.ERROR, message, error, metadata)
    
    if (error instanceof Error) {
      entry.stack = error.stack
    }
    
    this.log(LogLevel.ERROR, message, error, metadata)
  }

  fatal(message: string, error?: Error | any, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.FATAL, message, error, metadata)
    
    if (error instanceof Error) {
      entry.stack = error.stack
    }
    
    this.log(LogLevel.FATAL, message, error, metadata)
    
    // Immediately flush for fatal errors
    this.flush()
  }

  // Specialized logging methods
  performance(action: string, duration: number, metadata?: Record<string, any>): void {
    this.info(`Performance: ${action}`, { duration }, {
      type: 'performance',
      action,
      duration,
      ...metadata
    })
  }

  userAction(action: string, context?: any, metadata?: Record<string, any>): void {
    this.info(`User Action: ${action}`, context, {
      type: 'user_action',
      action,
      ...metadata
    })
  }

  apiCall(method: string, url: string, status: number, duration: number, metadata?: Record<string, any>): void {
    const level = status >= 400 ? LogLevel.ERROR : LogLevel.INFO
    this.log(level, `API Call: ${method} ${url}`, { status, duration }, {
      type: 'api_call',
      method,
      url,
      status,
      duration,
      ...metadata
    })
  }

  security(event: string, context?: any, metadata?: Record<string, any>): void {
    this.warn(`Security Event: ${event}`, context, {
      type: 'security',
      event,
      ...metadata
    })
  }

  // Utility methods
  flush(): void {
    // In a real implementation, this would batch send logs to remote endpoint
    this.buffer = []
  }

  getLogs(level?: LogLevel, limit?: number): LogEntry[] {
    if (!this.isClient) return []

    try {
      const stored = localStorage.getItem('vault_logs')
      let logs: LogEntry[] = stored ? JSON.parse(stored) : []

      if (level !== undefined) {
        logs = logs.filter(log => log.level >= level)
      }

      if (limit) {
        logs = logs.slice(-limit)
      }

      return logs
    } catch {
      return []
    }
  }

  clearLogs(): void {
    if (this.isClient) {
      localStorage.removeItem('vault_logs')
    }
    this.buffer = []
  }

  private cleanupOldLogs(): void {
    if (!this.isClient) return

    try {
      const stored = localStorage.getItem('vault_logs')
      if (!stored) return

      const logs: LogEntry[] = JSON.parse(stored)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      
      const recentLogs = logs.filter(log => 
        new Date(log.timestamp) > oneDayAgo
      )

      if (recentLogs.length !== logs.length) {
        localStorage.setItem('vault_logs', JSON.stringify(recentLogs))
      }
    } catch (error) {
      console.warn('Failed to cleanup old logs:', error)
    }
  }

  // Configuration methods
  setLevel(level: LogLevel): void {
    this.config.level = level
  }

  setRemoteEndpoint(endpoint: string): void {
    this.config.remoteEndpoint = endpoint
  }

  getConfig(): LoggerConfig {
    return { ...this.config }
  }
}

// Create singleton logger instance
export const logger = new VaultLogger()

// Convenience functions for common logging patterns
export const log = {
  debug: (message: string, context?: any) => logger.debug(message, context),
  info: (message: string, context?: any) => logger.info(message, context),
  warn: (message: string, context?: any) => logger.warn(message, context),
  error: (message: string, error?: Error | any) => logger.error(message, error),
  fatal: (message: string, error?: Error | any) => logger.fatal(message, error),
  
  // Specialized loggers
  perf: (action: string, duration: number) => logger.performance(action, duration),
  user: (action: string, context?: any) => logger.userAction(action, context),
  api: (method: string, url: string, status: number, duration: number) => 
    logger.apiCall(method, url, status, duration),
  security: (event: string, context?: any) => logger.security(event, context)
}

// Performance measurement utilities
export const perf = {
  start: (label: string): PerformanceMeasure => {
    const startTime = performance.now()
    return {
      label,
      startTime,
      end: () => {
        const duration = performance.now() - startTime
        logger.performance(label, duration)
        return duration
      }
    }
  },

  measure: async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const start = performance.now()
    try {
      const result = await fn()
      const duration = performance.now() - start
      logger.performance(label, duration)
      return result
    } catch (error) {
      const duration = performance.now() - start
      logger.performance(`${label} (failed)`, duration)
      throw error
    }
  }
}

interface PerformanceMeasure {
  label: string
  startTime: number
  end: () => number
}

// React hook for logging
export function useLogger() {
  return {
    logger,
    log,
    perf
  }
}

// Development helpers
if (process.env.NODE_ENV === 'development') {
  // Make logger available globally for debugging
  if (typeof window !== 'undefined') {
    (window as any).vaultLogger = logger
  }
}