// Simplified security functions for demo purposes
import { NextRequest, NextResponse } from 'next/server'

export function validatePasswordStrength(password: string): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []
  
  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

export function sanitizeInput(input: string): string {
  return input.trim()
}

export function rateLimit(options: {
  windowMs: number
  maxRequests: number
  message: string
}) {
  // Simplified rate limiting - in production use a proper rate limiter
  return async (request: NextRequest) => {
    // For demo purposes, always allow requests
    return null
  }
}

export function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  return response
}