'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { VaultError, ErrorCode, errorReporting } from '@/lib/error-handling'
import { animations } from '@/lib/animations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  AlertTriangle, 
  RefreshCw, 
  Home, 
  ChevronDown, 
  ChevronUp,
  Copy
} from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  showDetails?: boolean
  level?: 'page' | 'component' | 'feature'
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
  showDetails: boolean
  isRetrying: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  private retryCount = 0
  private maxRetries = 3

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      showDetails: false,
      isRetrying: false
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })

    // Report error
    errorReporting.report({
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: error.message,
      details: errorInfo,
      timestamp: new Date(),
      stack: error.stack
    }, {
      level: this.props.level || 'component',
      retryCount: this.retryCount
    })

    // Call custom error handler
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    if (this.retryCount < this.maxRetries) {
      this.setState({ isRetrying: true })
      this.retryCount++
      
      setTimeout(() => {
        this.setState({
          hasError: false,
          error: undefined,
          errorInfo: undefined,
          isRetrying: false
        })
      }, 1000)
    }
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  handleReload = () => {
    window.location.reload()
  }

  toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }))
  }

  copyErrorDetails = () => {
    const errorText = `
Error: ${this.state.error?.message}
Stack: ${this.state.error?.stack}
Component Stack: ${this.state.errorInfo?.componentStack}
Timestamp: ${new Date().toISOString()}
    `.trim()

    navigator.clipboard.writeText(errorText)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <motion.div
          className="min-h-[400px] flex items-center justify-center p-6"
          {...animations.fadeIn}
        >
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-danger" />
              </div>
              <CardTitle className="text-xl text-danger">
                {this.props.level === 'page' ? 'Page Error' : 'Something went wrong'}
              </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {this.state.error?.message || 'An unexpected error occurred'}
                </AlertDescription>
              </Alert>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 justify-center">
                {this.retryCount < this.maxRetries && (
                  <Button
                    onClick={this.handleRetry}
                    disabled={this.state.isRetrying}
                    className="min-w-[120px]"
                  >
                    {this.state.isRetrying ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try Again
                      </>
                    )}
                  </Button>
                )}

                <Button variant="outline" onClick={this.handleReload}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reload Page
                </Button>

                <Button variant="outline" onClick={this.handleGoHome}>
                  <Home className="w-4 h-4 mr-2" />
                  Go Home
                </Button>
              </div>

              {/* Error Details Toggle */}
              {(this.props.showDetails || process.env.NODE_ENV === 'development') && (
                <div className="space-y-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={this.toggleDetails}
                    className="w-full"
                  >
                    {this.state.showDetails ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Show Details
                      </>
                    )}
                  </Button>

                  {this.state.showDetails && (
                    <motion.div
                      className="space-y-3"
                      {...animations.fadeInUp}
                    >
                      <div className="bg-surface-sunken rounded-lg p-4 text-sm">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-ink">Error Details</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={this.copyErrorDetails}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        <div className="space-y-2 text-ink-muted">
                          <div>
                            <strong>Message:</strong> {this.state.error?.message}
                          </div>
                          <div>
                            <strong>Retry Count:</strong> {this.retryCount}/{this.maxRetries}
                          </div>
                          {this.state.error?.stack && (
                            <details className="mt-2">
                              <summary className="cursor-pointer font-medium">Stack Trace</summary>
                              <pre className="mt-2 text-xs bg-surface p-2 rounded border overflow-auto max-h-40">
                                {this.state.error.stack}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>

                    </motion.div>
                  )}
                </div>
              )}

              {/* Retry Limit Reached */}
              {this.retryCount >= this.maxRetries && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Maximum retry attempts reached. Please reload the page or contact support if the problem persists.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )
    }

    return this.props.children
  }
}

// Specialized error boundaries for different contexts
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      level="page"
      showDetails={process.env.NODE_ENV === 'development'}
      onError={(error, errorInfo) => {
        console.error('Page Error:', error, errorInfo)
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

export function ComponentErrorBoundary({ 
  children, 
  fallback 
}: { 
  children: ReactNode
  fallback?: ReactNode 
}) {
  return (
    <ErrorBoundary
      level="component"
      fallback={fallback || (
        <div className="p-4 border border-line rounded-lg bg-danger/10">
          <div className="flex items-center space-x-2 text-danger">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-medium">Component Error</span>
          </div>
          <p className="text-sm text-danger mt-1">
            This component encountered an error and couldn't render.
          </p>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}

export function FeatureErrorBoundary({ 
  children, 
  featureName 
}: { 
  children: ReactNode
  featureName: string 
}) {
  return (
    <ErrorBoundary
      level="feature"
      fallback={
        <Card className="w-full">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-caution mx-auto mb-3" />
            <h3 className="font-medium text-ink mb-2">
              {featureName} Unavailable
            </h3>
            <p className="text-sm text-ink-muted mb-4">
              This feature is temporarily unavailable due to an error.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reload
            </Button>
          </CardContent>
        </Card>
      }
      onError={(error) => {
        console.error(`Feature Error (${featureName}):`, error)
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

// Hook for handling errors in functional components
export function useErrorHandler() {
  const handleError = React.useCallback((error: Error, context?: any) => {
    // Report the error
    errorReporting.report({
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: error.message,
      details: context,
      timestamp: new Date(),
      stack: error.stack
    })

    // Re-throw to trigger error boundary
    throw error
  }, [])

  return { handleError }
}