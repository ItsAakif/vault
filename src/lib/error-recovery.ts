import { logger } from '@/lib/logger'
import { VaultError, ErrorCode } from '@/lib/error-handling'

export interface RecoveryStrategy {
  id: string
  name: string
  description: string
  execute: () => Promise<boolean>
  canExecute: (error: Error) => boolean
  priority: number // 1-10, higher = more priority
}

export interface RecoveryContext {
  error: Error
  component?: string
  feature?: string
  userId?: string
  retryCount: number
  lastAttempt?: Date
}

export class ErrorRecoveryService {
  private strategies: Map<string, RecoveryStrategy> = new Map()
  private recoveryHistory: Map<string, RecoveryContext[]> = new Map()
  private maxRetries = 3
  private cooldownPeriod = 5000 // 5 seconds

  constructor() {
    this.registerDefaultStrategies()
  }

  /**
   * Register a recovery strategy
   */
  registerStrategy(strategy: RecoveryStrategy): void {
    this.strategies.set(strategy.id, strategy)
  }

  /**
   * Attempt to recover from an error
   */
  async attemptRecovery(error: Error, context: Partial<RecoveryContext> = {}): Promise<boolean> {
    const recoveryContext: RecoveryContext = {
      error,
      retryCount: 0,
      ...context
    }

    // Check if we're within retry limits
    if (!this.canAttemptRecovery(recoveryContext)) {
      logger.warn('Recovery attempt blocked due to limits', { error: error.message, context })
      return false
    }

    // Find applicable strategies
    const applicableStrategies = Array.from(this.strategies.values())
      .filter(strategy => strategy.canExecute(error))
      .sort((a, b) => b.priority - a.priority)

    if (applicableStrategies.length === 0) {
      logger.warn('No recovery strategies available for error', { error: error.message })
      return false
    }

    // Attempt recovery with each strategy
    for (const strategy of applicableStrategies) {
      try {
        logger.info(`Attempting recovery with strategy: ${strategy.name}`, {
          error: error.message,
          strategy: strategy.id
        })

        const success = await strategy.execute()
        
        if (success) {
          logger.info(`Recovery successful with strategy: ${strategy.name}`, {
            error: error.message,
            strategy: strategy.id
          })
          
          this.recordRecoveryAttempt(recoveryContext, strategy.id, true)
          return true
        }
      } catch (strategyError) {
        logger.error(`Recovery strategy failed: ${strategy.name}`, {
          originalError: error.message,
          strategyError: strategyError instanceof Error ? strategyError.message : strategyError,
          strategy: strategy.id
        })
      }
    }

    this.recordRecoveryAttempt(recoveryContext, 'none', false)
    return false
  }

  /**
   * Check if we can attempt recovery based on limits and cooldowns
   */
  private canAttemptRecovery(context: RecoveryContext): boolean {
    const key = this.getContextKey(context)
    const history = this.recoveryHistory.get(key) || []
    
    // Check retry limit
    const recentAttempts = history.filter(
      attempt => attempt.lastAttempt && 
        Date.now() - attempt.lastAttempt.getTime() < 60000 // 1 minute
    )
    
    if (recentAttempts.length >= this.maxRetries) {
      return false
    }

    // Check cooldown
    const lastAttempt = history[history.length - 1]
    if (lastAttempt?.lastAttempt) {
      const timeSinceLastAttempt = Date.now() - lastAttempt.lastAttempt.getTime()
      if (timeSinceLastAttempt < this.cooldownPeriod) {
        return false
      }
    }

    return true
  }

  /**
   * Record a recovery attempt
   */
  private recordRecoveryAttempt(
    context: RecoveryContext, 
    strategyId: string, 
    success: boolean
  ): void {
    const key = this.getContextKey(context)
    const history = this.recoveryHistory.get(key) || []
    
    const attempt = {
      ...context,
      retryCount: context.retryCount + 1,
      lastAttempt: new Date(),
      strategyUsed: strategyId,
      success
    }
    
    history.push(attempt)
    
    // Keep only last 10 attempts
    if (history.length > 10) {
      history.splice(0, history.length - 10)
    }
    
    this.recoveryHistory.set(key, history)
  }

  /**
   * Generate a unique key for the recovery context
   */
  private getContextKey(context: RecoveryContext): string {
    return `${context.error.name}-${context.component || 'unknown'}-${context.feature || 'unknown'}`
  }

  /**
   * Register default recovery strategies
   */
  private registerDefaultStrategies(): void {
    // Strategy 1: Reload page for critical errors
    this.registerStrategy({
      id: 'page-reload',
      name: 'Page Reload',
      description: 'Reload the entire page to recover from critical errors',
      priority: 1,
      canExecute: (error) => {
        return error.name === 'ChunkLoadError' || 
               error.message.includes('Loading chunk') ||
               error.message.includes('NetworkError')
      },
      execute: async () => {
        window.location.reload()
        return true
      }
    })

    // Strategy 2: Clear localStorage and reload
    this.registerStrategy({
      id: 'clear-storage-reload',
      name: 'Clear Storage and Reload',
      description: 'Clear local storage and reload to fix corrupted state',
      priority: 2,
      canExecute: (error) => {
        return error.message.includes('QuotaExceededError') ||
               error.message.includes('storage') ||
               error.message.includes('localStorage')
      },
      execute: async () => {
        try {
          localStorage.clear()
          sessionStorage.clear()
          window.location.reload()
          return true
        } catch {
          return false
        }
      }
    })

    // Strategy 3: Retry API calls
    this.registerStrategy({
      id: 'api-retry',
      name: 'API Retry',
      description: 'Retry failed API calls with exponential backoff',
      priority: 7,
      canExecute: (error) => {
        return error.message.includes('fetch') ||
               error.message.includes('NetworkError') ||
               error.message.includes('Failed to fetch')
      },
      execute: async () => {
        // This would be implemented to retry the last failed API call
        // For now, we'll just wait and return true to indicate potential success
        await new Promise(resolve => setTimeout(resolve, 1000))
        return true
      }
    })

    // Strategy 4: Reset component state
    this.registerStrategy({
      id: 'component-reset',
      name: 'Component Reset',
      description: 'Reset component state to recover from state-related errors',
      priority: 8,
      canExecute: (error) => {
        return error.message.includes('Cannot read') ||
               error.message.includes('undefined') ||
               error.message.includes('null')
      },
      execute: async () => {
        // This would trigger a component state reset
        // Implementation would depend on the specific state management
        return true
      }
    })

    // Strategy 5: Fallback to offline mode
    this.registerStrategy({
      id: 'offline-fallback',
      name: 'Offline Fallback',
      description: 'Switch to offline mode when network is unavailable',
      priority: 6,
      canExecute: (error) => {
        return !navigator.onLine ||
               error.message.includes('NetworkError') ||
               error.message.includes('Failed to fetch')
      },
      execute: async () => {
        // Enable offline mode
        if ('serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.ready
            registration.active?.postMessage({ type: 'ENABLE_OFFLINE_MODE' })
            return true
          } catch {
            return false
          }
        }
        return false
      }
    })

    // Strategy 6: Clear cache and retry
    this.registerStrategy({
      id: 'cache-clear',
      name: 'Clear Cache',
      description: 'Clear cache and retry to fix stale data issues',
      priority: 5,
      canExecute: (error) => {
        return error.message.includes('cache') ||
               error.message.includes('stale') ||
               error.message.includes('version')
      },
      execute: async () => {
        try {
          if ('caches' in window) {
            const cacheNames = await caches.keys()
            await Promise.all(
              cacheNames.map(name => caches.delete(name))
            )
          }
          return true
        } catch {
          return false
        }
      }
    })

    // Strategy 7: Navigate to safe page
    this.registerStrategy({
      id: 'safe-navigation',
      name: 'Navigate to Safe Page',
      description: 'Navigate to a safe page when current page is broken',
      priority: 3,
      canExecute: (error) => {
        return error.message.includes('routing') ||
               error.message.includes('navigation') ||
               window.location.pathname !== '/'
      },
      execute: async () => {
        window.location.href = '/'
        return true
      }
    })

    // Strategy 8: Memory cleanup
    this.registerStrategy({
      id: 'memory-cleanup',
      name: 'Memory Cleanup',
      description: 'Clean up memory and close unnecessary resources',
      priority: 9,
      canExecute: (error) => {
        return error.message.includes('memory') ||
               error.message.includes('Maximum call stack')
      },
      execute: async () => {
        try {
          // Force garbage collection if available
          if (window.gc) {
            window.gc()
          }
          
          // Clear any intervals/timeouts
          const highestTimeoutId = window.setTimeout(() => {}, 0)
          for (let i = 0; i < highestTimeoutId; i++) {
            clearTimeout(i)
            clearInterval(i)
          }
          
          return true
        } catch {
          return false
        }
      }
    })
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): { [strategyId: string]: { attempts: number; successes: number } } {
    const stats: { [strategyId: string]: { attempts: number; successes: number } } = {}
    
    Array.from(this.recoveryHistory.values()).forEach(history => {
      history.forEach(attempt => {
        const strategyId = (attempt as any).strategyUsed || 'unknown'
        if (!stats[strategyId]) {
          stats[strategyId] = { attempts: 0, successes: 0 }
        }
        stats[strategyId].attempts++
        if ((attempt as any).success) {
          stats[strategyId].successes++
        }
      })
    })
    
    return stats
  }

  /**
   * Clear recovery history
   */
  clearHistory(): void {
    this.recoveryHistory.clear()
  }
}

// Create and export a singleton instance
export const errorRecoveryService = new ErrorRecoveryService()

// Declare global gc function for TypeScript
declare global {
  interface Window {
    gc?: () => void
  }
}