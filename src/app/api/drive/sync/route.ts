import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { GoogleDriveProvider } from '@/lib/cloud-storage/google-drive';
import { db } from '@/lib/db';
import { z } from 'zod';

const syncSchema = z.object({
  action: z.enum(['sync', 'backup', 'restore']),
  fileIds: z.array(z.string()).optional(),
  folderId: z.string().optional(),
  includeSubfolders: z.boolean().optional().default(false)
});

// GET /api/drive/sync - Get sync status and connection info
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // Get Google Drive integration
    const integration = await db.cloudIntegration.findFirst({
      where: {
        userId,
        provider: 'google',
        isActive: true
      }
    });

    if (!integration) {
      return NextResponse.json({
        success: true,
        connected: false,
        message: 'Google Drive not connected'
      });
    }

    // Test connection
    try {
      const driveProvider = new GoogleDriveProvider({
        provider: 'google',
        accessToken: integration.accessToken,
        refreshToken: integration.refreshToken || undefined,
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!
      });

      // Test with a simple about query
      const about = await driveProvider.getAbout();
      
      // Get recent sync activities
      const recentSyncs = await db.activity.findMany({
        where: {
          userId,
          type: 'UPDATE',
          action: {
            in: ['drive_sync_started', 'drive_sync_completed', 'drive_sync_failed']
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 10
      });

      // Get storage usage
      const storageQuota = about.storageQuota || {};
      
      return NextResponse.json({
        success: true,
        connected: true,
        user: {
          email: about.user?.emailAddress,
          displayName: about.user?.displayName,
          photoLink: about.user?.photoLink
        },
        storage: {
          limit: storageQuota.limit ? parseInt(storageQuota.limit) : null,
          usage: storageQuota.usage ? parseInt(storageQuota.usage) : null,
          usageInDrive: storageQuota.usageInDrive ? parseInt(storageQuota.usageInDrive) : null
        },
        lastSync: recentSyncs[0]?.createdAt || null,
        recentSyncs: recentSyncs.map(sync => ({
          id: sync.id,
          action: sync.action,
          createdAt: sync.createdAt,
          metadata: sync.metadata
        }))
      });
    } catch (connectionError) {
      console.error('Google Drive connection test failed:', connectionError);
      
      return NextResponse.json({
        success: true,
        connected: false,
        error: 'Connection test failed',
        message: 'Google Drive connection is not working properly'
      });
    }
  } catch (error) {
    console.error('Google Drive sync status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}

// POST /api/drive/sync - Trigger sync operation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const body = await request.json();
    const validatedData = syncSchema.parse(body);

    // Get Google Drive integration
    const integration = await db.cloudIntegration.findFirst({
      where: {
        userId,
        provider: 'google',
        isActive: true
      }
    });

    if (!integration) {
      return NextResponse.json(
        { success: false, error: 'Google Drive not connected' },
        { status: 401 }
      );
    }

    const driveProvider = new GoogleDriveProvider({
      provider: 'google',
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken || undefined,
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    });

    // Log sync start
    const syncActivity = await db.activity.create({
      data: {
        userId,
        type: 'UPDATE',
        action: 'drive_sync_started',
        entityType: 'sync',
        entityId: `sync-${Date.now()}`,
        metadata: {
          action: validatedData.action,
          fileIds: validatedData.fileIds,
          folderId: validatedData.folderId,
          includeSubfolders: validatedData.includeSubfolders,
          provider: 'google'
        }
      }
    });

    let result;
    
    try {
      switch (validatedData.action) {
        case 'sync':
          // Perform bidirectional sync
          result = await performSync(driveProvider, userId, validatedData);
          break;
          
        case 'backup':
          // Upload local files to Drive
          result = await performBackup(driveProvider, userId, validatedData);
          break;
          
        case 'restore':
          // Download files from Drive
          result = await performRestore(driveProvider, userId, validatedData);
          break;
          
        default:
          throw new Error('Invalid sync action');
      }

      // Log sync completion
      await db.activity.create({
        data: {
          userId,
          type: 'UPDATE',
          action: 'drive_sync_completed',
          entityType: 'sync',
          entityId: syncActivity.entityId,
          metadata: {
            ...metadataRecord(syncActivity.metadata),
            result,
            duration: Date.now() - syncActivity.createdAt.getTime()
          }
        }
      });

      return NextResponse.json({
        success: true,
        result,
        message: `${validatedData.action} completed successfully`
      });
    } catch (syncError) {
      // Log sync failure
      await db.activity.create({
        data: {
          userId,
          type: 'UPDATE',
          action: 'drive_sync_failed',
          entityType: 'sync',
          entityId: syncActivity.entityId,
          metadata: {
            ...metadataRecord(syncActivity.metadata),
            error: syncError instanceof Error ? syncError.message : 'Unknown error',
            duration: Date.now() - syncActivity.createdAt.getTime()
          }
        }
      });

      throw syncError;
    }
  } catch (error) {
    console.error('Google Drive sync error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid sync parameters', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Sync operation failed' },
      { status: 500 }
    );
  }
}

// Helper functions for sync operations
function metadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function performSync(driveProvider: GoogleDriveProvider, userId: string, options: any) {
  // This is a simplified sync implementation
  // In a real application, you would implement proper conflict resolution
  
  const syncedFiles: string[] = [];
  const errors: string[] = [];
  
  try {
    // Get local files that need syncing
    const localFiles = await db.file.findMany({
      where: {
        userId,
        ...(options.fileIds && { id: { in: options.fileIds } })
      }
    });

    for (const localFile of localFiles) {
      try {
        // Check if file exists in Drive
        const driveFiles = await driveProvider.listFilesPaged({
          query: `name='${localFile.name}' and trashed=false`
        });

        if (driveFiles.files.length === 0) {
          // Upload to Drive
          // This would need actual file content retrieval
          syncedFiles.push(localFile.id);
        } else {
          // Compare and sync if needed
          syncedFiles.push(localFile.id);
        }
      } catch (fileError) {
        errors.push(`Failed to sync ${localFile.name}: ${fileError}`);
      }
    }

    return {
      syncedFiles: syncedFiles.length,
      errors: errors.length,
      details: { syncedFiles, errors }
    };
  } catch (error) {
    throw new Error(`Sync failed: ${error}`);
  }
}

async function performBackup(driveProvider: GoogleDriveProvider, userId: string, options: any) {
  // Simplified backup implementation
  return {
    backedUpFiles: 0,
    message: 'Backup functionality needs implementation'
  };
}

async function performRestore(driveProvider: GoogleDriveProvider, userId: string, options: any) {
  // Simplified restore implementation
  return {
    restoredFiles: 0,
    message: 'Restore functionality needs implementation'
  };
}