'use client'

import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SignInFormProps {
  googleEnabled: boolean
}

export default function SignInForm({ googleEnabled }: SignInFormProps) {
  if (!googleEnabled) {
    // ADR-007 D5: Google is the only identity provider, so with no credentials there is no
    // way in. Say so plainly; do not render a button that cannot work.
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="max-w-md w-full">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Sign-in is not available</CardTitle>
            <CardDescription className="text-center">
              This server has no sign-in method configured. Set GOOGLE_CLIENT_ID and
              GOOGLE_CLIENT_SECRET, then restart the application.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="max-w-md w-full">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Sign in</CardTitle>
          <CardDescription className="text-center">
            Continue with your Google account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              void signIn('google', { callbackUrl: '/' })
            }}
          >
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
