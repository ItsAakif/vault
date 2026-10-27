'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

// Only OAuthAccountNotLinked gets a distinct, actionable message. ADR-007 D8 keeps
// `allowDangerousEmailAccountLinking` on the Google provider, guarded by the `email_verified`
// signIn gate, so this should be unreachable for Google; keep the case for safety and do not
// remove the gate while the flag remains.
const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    'That email is already linked to a different sign-in method. Contact the administrator of this server.',
  Configuration:
    'Authentication failed because the sign-in service is misconfigured. Please try again later.',
  AccessDenied:
    'Authentication failed because you do not have permission to sign in with this account.',
  Verification: 'Authentication failed because that sign-in link is invalid or has expired.',
}

const DEFAULT_ERROR_MESSAGE = 'Authentication failed. Please try again.'

export default function AuthErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const message = error && ERROR_MESSAGES[error] ? ERROR_MESSAGES[error] : DEFAULT_ERROR_MESSAGE
  const isAccountNotLinked = error === 'OAuthAccountNotLinked'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="mt-4">
              {isAccountNotLinked ? 'Email already registered' : 'Authentication failed'}
            </CardTitle>
            <CardDescription>We could not complete your sign-in.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {isAccountNotLinked ? 'Email already registered' : 'Authentication failed'}
              </AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>

            <Link href="/auth/signin">
              <Button className="w-full">Back to sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
