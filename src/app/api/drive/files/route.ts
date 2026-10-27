import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { GoogleDriveProvider } from '@/lib/cloud-storage/google-drive';
import { db } from '@/lib/db';
import { z } from 'zod';

const uploadSchema = z.object({
  fileName: z.string().min(1),
  fileContent: z.string(), // Base64 encoded content
  mimeType: z.string().optional(),
  folderId: z.string().optional(),
  description: z.string().optional()
});

const listSchema = z.object({
  folderId: z.string().optional(),
  pageSize: z.number().min(1).max(1000).optional().default(100),
  pageToken: z.string().optional(),
  query: z.string().optional()
});

// GET /api/drive/files - List files from Google Drive
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    
    const queryParams = {
      folderId: searchParams.get('folderId') || undefined,
      pageSize: parseInt(searchParams.get('pageSize') || '100'),
      pageToken: searchParams.get('pageToken') || undefined,
      query: searchParams.get('query') || undefined
    };

    const validatedParams = listSchema.parse(queryParams);

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

    const files = await driveProvider.listFilesPaged({
      folderId: validatedParams.folderId,
      pageSize: validatedParams.pageSize,
      pageToken: validatedParams.pageToken,
      query: validatedParams.query
    });

    return NextResponse.json({
      success: true,
      files: files.files,
      nextPageToken: files.nextPageToken,
      totalCount: files.files.length
    });
  } catch (error) {
    console.error('Google Drive list files error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid parameters', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to list files' },
      { status: 500 }
    );
  }
}

// POST /api/drive/files - Upload file to Google Drive
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const body = await request.json();
    const validatedData = uploadSchema.parse(body);

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

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(validatedData.fileContent, 'base64');

    const uploadedFile = await driveProvider.uploadFile(fileBuffer, {
      fileName: validatedData.fileName,
      mimeType: validatedData.mimeType ?? 'application/octet-stream',
      parentId: validatedData.folderId,
    });

    // Log the upload activity
    await db.activity.create({
      data: {
        userId,
        type: 'CREATE',
        action: 'uploaded_to_drive',
        entityType: 'file',
        entityId: uploadedFile.id,
        metadata: {
          fileName: validatedData.fileName,
          fileSize: fileBuffer.length,
          mimeType: validatedData.mimeType,
          provider: 'google'
        }
      }
    });

    return NextResponse.json({
      success: true,
      file: uploadedFile,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    console.error('Google Drive upload error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid file data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

// DELETE /api/drive/files - Delete file from Google Drive
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: 'File ID required' },
        { status: 400 }
      );
    }

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

    // Get file info before deletion for logging
    let fileName = 'Unknown';
    try {
      const fileInfo = await driveProvider.getFile(fileId);
      fileName = fileInfo.name || 'Unknown';
    } catch (error) {
      console.warn('Could not get file info before deletion:', error);
    }

    await driveProvider.deleteFile(fileId);

    // Log the deletion activity
    await db.activity.create({
      data: {
        userId,
        type: 'DELETE',
        action: 'deleted_from_drive',
        entityType: 'file',
        entityId: fileId,
        metadata: {
          fileName,
          provider: 'google'
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Google Drive delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}