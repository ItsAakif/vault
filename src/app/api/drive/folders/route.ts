import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { GoogleDriveProvider } from '@/lib/cloud-storage/google-drive';
import { db } from '@/lib/db';
import { z } from 'zod';

const createFolderSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().optional(),
  description: z.string().optional()
});

// GET /api/drive/folders - List folders from Google Drive
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    
    const parentId = searchParams.get('parentId') || undefined;
    const pageSize = parseInt(searchParams.get('pageSize') || '100');
    const pageToken = searchParams.get('pageToken') || undefined;

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

    // List folders only
    const folders = await driveProvider.listFilesPaged({
      folderId: parentId,
      pageSize,
      pageToken,
      query: "mimeType='application/vnd.google-apps.folder'"
    });

    return NextResponse.json({
      success: true,
      folders: folders.files,
      nextPageToken: folders.nextPageToken,
      totalCount: folders.files.length
    });
  } catch (error) {
    console.error('Google Drive list folders error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list folders' },
      { status: 500 }
    );
  }
}

// POST /api/drive/folders - Create folder in Google Drive
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const body = await request.json();
    const validatedData = createFolderSchema.parse(body);

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

    const createdFolder = await driveProvider.createFolder(
      validatedData.name,
      validatedData.parentId
    );

    // Log the folder creation activity
    await db.activity.create({
      data: {
        userId,
        type: 'CREATE',
        action: 'created_in_drive',
        entityType: 'folder',
        entityId: createdFolder.id,
        metadata: {
          folderName: validatedData.name,
          parentId: validatedData.parentId,
          provider: 'google'
        }
      }
    });

    return NextResponse.json({
      success: true,
      folder: createdFolder,
      message: 'Folder created successfully'
    });
  } catch (error) {
    console.error('Google Drive create folder error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid folder data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create folder' },
      { status: 500 }
    );
  }
}