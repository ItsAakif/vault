'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shell'
import { useToast } from '@/hooks/use-toast'
import { CloudIcon, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { startGoogleDriveConnect } from '@/lib/drive-client'

interface CloudProvider {
  id: string
  name: string
  enabled: boolean
  clientId?: string
  clientSecret?: string
  configured: boolean
  status: 'connected' | 'disconnected' | 'error'
}

export default function CloudStorageSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<CloudProvider[]>([
    {
      id: 'google',
      name: 'Google Drive',
      enabled: false,
      configured: false,
      status: 'disconnected'
    }
  ])

  useEffect(() => {
    loadCloudSettings()
  }, [])

  const loadCloudSettings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/settings/cloud-storage')
      if (response.ok) {
        const data = await response.json()
        setProviders(prev => prev.map(p => ({
          ...p,
          ...data.providers?.find((dp: any) => dp.id === p.id)
        })))
      }
    } catch (error) {
      console.error('Failed to load cloud settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateMobileLink = async () => {
    try {
      const response = await fetch('/api/mobile-link/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to generate mobile link')
      }

      toast({
        title: 'Success',
        description: 'Mobile link generated successfully'
      })

      return data.data
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate mobile link',
        variant: 'destructive'
      })
      throw error
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        className="p-0"
        title="Cloud Storage"
        description={`${providers[0]?.name ?? 'Google Drive'} is the cloud storage backend for this instance.`}
      />

      <Alert className="bg-surface-sunken">
        <CloudIcon className="h-4 w-4" />
        <AlertDescription>
          This is a self-hosted instance. Google Drive credentials are configured on the server, and
          your Google account is connected from this page.
        </AlertDescription>
      </Alert>

      <GoogleDriveCard onGenerateLink={handleGenerateMobileLink} />
    </div>
  )
}

interface GoogleDriveCardProps {
  onGenerateLink: () => Promise<any>
}

function GoogleDriveCard({ onGenerateLink }: GoogleDriveCardProps) {
  const [driveStatus, setDriveStatus] = useState<any>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [mobileLink, setMobileLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generatingLink, setGeneratingLink] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    checkDriveStatus()
  }, [])

  const checkDriveStatus = async () => {
    setLoadingStatus(true)
    try {
      const response = await fetch('/api/drive/status')
      const data = await response.json()
      setDriveStatus(data)
    } catch (error) {
      console.error('Failed to check drive status:', error)
    } finally {
      setLoadingStatus(false)
    }
  }

  const handleConnectDrive = async () => {
    setConnecting(true)
    try {
      // ADR-008 D5: one shared sequence with the Drive notice CTA (startGoogleDriveConnect),
      // so this page and the notice cannot drift. The 500 discriminator, the non-ok message,
      // the missing-authUrl message and the network-failure fallback are all unchanged copy.
      const result = await startGoogleDriveConnect()
      if (!result.ok) {
        toast({
          title: 'Connection Failed',
          description: result.message,
          variant: 'destructive'
        })
      }
    } finally {
      setConnecting(false)
    }
  }

  const handleGenerateLink = async () => {
    setGeneratingLink(true)
    try {
      const data = await onGenerateLink()
      setMobileLink(data.link)
    } finally {
      setGeneratingLink(false)
    }
  }

  const handleCopyLink = () => {
    if (mobileLink) {
      navigator.clipboard.writeText(mobileLink)
      setCopied(true)
      toast({
        title: 'Copied',
        description: 'Mobile link copied to clipboard'
      })
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CloudIcon className="h-5 w-5" />
              Google Drive
            </CardTitle>
            <CardDescription>
              Connect your Google Drive for secure cloud sync
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {loadingStatus ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : driveStatus?.isConnected ? (
              <Badge variant="default" className="bg-positive/10 text-positive">
                <CheckCircle className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                <AlertCircle className="h-3 w-3 mr-1" />
                Not Connected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      {/* One card, sections separated by spacing and a heading - no nested fills. */}
      <CardContent className="space-y-6">
        {/* Connection Status Section */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Connection Status</h4>
          {loadingStatus ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Checking connection...</span>
            </div>
          ) : driveStatus?.isConnected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-positive" />
                <span className="text-sm font-medium">Connected to Google Drive</span>
              </div>
              <div className="text-sm text-muted-foreground space-y-1 ml-6">
                <div><strong>Email:</strong> {driveStatus?.data?.userEmail}</div>
                <div><strong>Name:</strong> {driveStatus?.data?.userName}</div>
                <div><strong>Vault Folder:</strong> ID: {driveStatus?.data?.vaultFolderId?.slice(0, 12)}...</div>
                <div><strong>Categories:</strong> {driveStatus?.data?.categories?.join(', ') || 'Not found'}</div>
                <div><strong>Setup Complete:</strong> {driveStatus?.data?.setupPercentage}%</div>
                <div><strong>Last Checked:</strong> {new Date(driveStatus?.data?.lastChecked).toLocaleString()}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Not connected</span>
              </div>
              <p className="text-sm text-muted-foreground ml-6">
                Click "Connect to Google Drive" to authenticate and set up your vault.
              </p>
            </div>
          )}
        </div>

        {/* OAuth Connection */}
        {!driveStatus?.isConnected && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">First Time Setup</h4>
            <p className="text-sm text-muted-foreground">
              Connect your Google account to use Google Drive as your secure cloud storage backend.
              Your data will be stored in your own Google Drive.
            </p>
            <Button
              className="w-full sm:w-auto"
              onClick={handleConnectDrive}
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <CloudIcon className="mr-2 h-4 w-4" />
                  Connect to Google Drive
                </>
              )}
            </Button>
          </div>
        )}

        {/* Mobile Link Generation */}
        {driveStatus?.isConnected && (
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium">Mobile App Link</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Generate a secure link to authenticate your mobile app with this Google Drive vault.
                The link expires after 24 hours.
              </p>
            </div>

            {mobileLink ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
                  <code className="text-xs font-mono text-foreground truncate flex-1">
                    {mobileLink}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyLink}
                    className="whitespace-nowrap"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  ⏱️ This link expires in 24 hours
                </div>
              </div>
            ) : (
              <Button
                className="w-full sm:w-auto"
                onClick={handleGenerateLink}
                disabled={generatingLink}
                variant="default"
              >
                {generatingLink ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Mobile Link'
                )}
              </Button>
            )}
          </div>
        )}

        {/* Setup Guide */}
        {!driveStatus?.isConnected && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Why Google Drive?</h4>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li><strong>Your data, your control:</strong> All data stored in your own Google Drive</li>
              <li><strong>End-to-end sync:</strong> Seamless sync between web and mobile apps</li>
              <li><strong>Offline support:</strong> Work offline, sync when you're back online</li>
              <li><strong>Zero server storage:</strong> Your data never stored on our servers</li>
              <li><strong>Mobile link sharing:</strong> Securely link mobile apps with 24-hour tokens</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
