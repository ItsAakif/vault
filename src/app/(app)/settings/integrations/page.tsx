'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/shell';
import { CheckCircle, AlertCircle, Cloud, Settings, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { isRecord, readCollection } from '@/lib/api-collection';

interface CloudIntegration {
  id: string;
  provider: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: {
    email?: string;
    displayName?: string;
    photoLink?: string;
  };
}

// T093: `GET /api/integrations` answers `{ integrations: [...] }`. If that body (or the field) is
// an object, `integrations.find(...)` below used to throw; the reader makes it `[]`, which this
// page already renders as "no integration connected".
function isCloudIntegration(value: unknown): value is CloudIntegration {
  return isRecord(value) && typeof value.id === 'string' && typeof value.provider === 'string';
}

function IntegrationsContent() {
  const [integrations, setIntegrations] = useState<CloudIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    fetchIntegrations();
    
    // Handle callback messages
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const provider = searchParams.get('provider');
    
    if (success === 'google_connected') {
      toast.success('Google Drive connected successfully!');
      fetchIntegrations(); // Refresh the list
    } else if (error) {
      const errorMessages: Record<string, string> = {
        'not_authenticated': 'Your session expired before the connection finished. Sign in and try again.',
        'invalid_state': 'The connection request could not be verified. Please start again.',
        'missing_params': 'Google did not return the data needed to finish connecting. Please try again.',
        'invalid_user': 'That account could not be matched to a user. Please sign in again.',
        'token_exchange': 'Google rejected the authorization code. Please try again.',
        'oauth_error': 'Google reported an error while authorizing. Please try again.',
        'callback_error': 'Failed to connect to Google Drive. Please try again.',
        'auth_error': 'Authentication failed. Please check your permissions.',
        'token_error': 'Token exchange failed. Please try again.'
      };
      toast.error(errorMessages[error] || 'Connection failed. Please try again.');
    }
  }, [searchParams]);

  const fetchIntegrations = async () => {
    try {
      const response = await fetch('/api/integrations');
      if (response.ok) {
        const data: unknown = await response.json();
        setIntegrations(
          readCollection(isRecord(data) ? data.integrations : data, isCloudIntegration)
        );
      }
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
      toast.error('Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  const connectGoogleDrive = async () => {
    try {
      setConnecting('google');
      const response = await fetch('/api/drive/auth', {
        method: 'GET'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.authUrl) {
          window.location.href = data.authUrl;
        }
      } else {
        throw new Error('Failed to get authorization URL');
      }
    } catch (error) {
      console.error('Failed to connect Google Drive:', error);
      toast.error('Failed to connect Google Drive');
    } finally {
      setConnecting(null);
    }
  };

  const disconnectIntegration = async (provider: string) => {
    try {
      const response = await fetch(`/api/drive/auth`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        toast.success(`${provider} disconnected successfully`);
        fetchIntegrations();
      } else {
        throw new Error('Failed to disconnect');
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
      toast.error('Failed to disconnect integration');
    }
  };

  const testConnection = async (provider: string) => {
    try {
      const response = await fetch('/api/drive/sync');
      if (response.ok) {
        const data = await response.json();
        if (data.connected) {
          toast.success('Connection test successful!');
        } else {
          toast.error('Connection test failed');
        }
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      toast.error('Connection test failed');
    }
  };

  const googleIntegration = integrations.find(i => i.provider === 'google');

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        className="p-0"
        title="Integrations"
        description="Connect your cloud storage accounts to sync files across devices"
      />

      <div className="grid gap-6">
        {/* Google Drive Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-signal/10 rounded-lg flex items-center justify-center">
                  <Cloud className="h-5 w-5 text-signal" />
                </div>
                <div>
                  <CardTitle>Google Drive</CardTitle>
                  <CardDescription>
                    Sync files with your Google Drive account
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {googleIntegration?.isActive ? (
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
          <CardContent>
            {googleIntegration?.isActive ? (
              <div className="space-y-4">
                {googleIntegration.metadata && (
                  <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
                    {googleIntegration.metadata.photoLink && (
                      <img 
                        src={googleIntegration.metadata.photoLink} 
                        alt="Profile" 
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    <div>
                      <p className="font-medium">
                        {googleIntegration.metadata.displayName || 'Google User'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {googleIntegration.metadata.email}
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => testConnection('google')}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Test Connection
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    asChild
                  >
                    <a href="/files?provider=google" target="_blank">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Files
                    </a>
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => disconnectIntegration('Google Drive')}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  Connected on {new Date(googleIntegration.createdAt).toLocaleDateString()}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect your Google Drive account to sync files, create backups, and access your documents from anywhere.
                </p>
                
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You'll be redirected to Google to authorize access to your Drive files.
                  </AlertDescription>
                </Alert>
                
                <Button 
                  onClick={connectGoogleDrive}
                  disabled={connecting === 'google'}
                  className="w-full sm:w-auto"
                >
                  {connecting === 'google' ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Cloud className="h-4 w-4 mr-2" />
                  )}
                  Connect Google Drive
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <Separator />
      
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Integration Features</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h3 className="font-medium">File Synchronization</h3>
            <p className="text-sm text-muted-foreground">
              Automatically sync your files across all connected devices and cloud storage providers.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Backup & Restore</h3>
            <p className="text-sm text-muted-foreground">
              Create automatic backups of your important files and restore them when needed.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Cross-Platform Access</h3>
            <p className="text-sm text-muted-foreground">
              Access your files from web, mobile, and desktop applications seamlessly.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Secure Authentication</h3>
            <p className="text-sm text-muted-foreground">
              OAuth2-based authentication ensures your credentials are never stored locally.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>
        </div>
      }
    >
      <IntegrationsContent />
    </Suspense>
  );
}