import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { GoogleDriveProvider } from '@/lib/cloud-storage/google-drive';
import { db } from '@/lib/db';

interface RouteParams {
  params: Promise<{ fileId: string }>;
}

// GET /api/drive/files/[fileId] - Download file from Google Drive
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { fileId } = await params;
    const { searchParams } = new URL(request.url);
    const download = searchParams.get('download') === 'true';
    const metadata = searchParams.get('metadata') === 'true';

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

    // If only metadata is requested
    if (metadata && !download) {
      const fileInfo = await driveProvider.getFile(fileId);
      return NextResponse.json({
        success: true,
        file: fileInfo
      });
    }

    // Download the file
    const fileData = await driveProvider.downloadFile(fileId);
    
    if (!fileData) {
      return NextResponse.json(
        { success: false, error: 'File not found or empty' },
        { status: 404 }
      );
    }

    // Get file metadata
    const fileInfo = await driveProvider.getFile(fileId);

    // Log the download activity
    await db.activity.create({
      data: {
        userId,
        type: 'VIEW',
        action: 'downloaded_from_drive',
        entityType: 'file',
        entityId: fileId,
        metadata: {
          fileName: fileInfo.name,
          fileSize: fileInfo.size,
          mimeType: fileInfo.mimeType,
          provider: 'google'
        }
      }
    });

    // If download parameter is true, return file as attachment
    if (download) {
      const headers = new Headers();
      headers.set('Content-Type', fileInfo.mimeType || 'application/octet-stream');
      headers.set('Content-Disposition', `attachment; filename="${fileInfo.name}"`);
      headers.set('Content-Length', fileData.length.toString());
      
      return new NextResponse(new Uint8Array(fileData), {
        status: 200,
        headers
      });
    }

    // Return file data as base64 in JSON response
    return NextResponse.json({
      success: true,
      file: {
        id: fileInfo.id,
        name: fileInfo.name,
        mimeType: fileInfo.mimeType,
        size: fileInfo.size,
        modifiedTime: fileInfo.modifiedAt,
        content: fileData.toString('base64')
      }
    });
  } catch (error) {
    console.error('Google Drive download error:', error);
    
    // Handle specific Google Drive errors
    if (error instanceof Error) {
      if (error.message.includes('File not found')) {
        return NextResponse.json(
          { success: false, error: 'File not found' },
          { status: 404 }
        );
      }
      
      if (error.message.includes('Access denied')) {
        return NextResponse.json(
          { success: false, error: 'Access denied to file' },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to download file' },
      { status: 500 }
    );
  }
}

// PUT /api/drive/files/[fileId] - Update file in Google Drive
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { fileId } = await params;
    const body = await request.json();
    
    const { fileName, fileContent, mimeType, description } = body;

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

    // Prepare update data
    const updateData: any = {};
    
    if (fileName) updateData.name = fileName;
    if (description !== undefined) updateData.description = description;
    
    let fileBuffer: Buffer | undefined;
    if (fileContent) {
      fileBuffer = Buffer.from(fileContent, 'base64');
    }

    const updatedFile = await driveProvider.updateFile(fileId, {
      metadata: updateData,
      content: fileBuffer,
      mimeType
    });

    // Log the update activity
    await db.activity.create({
      data: {
        userId,
        type: 'UPDATE',
        action: 'updated_in_drive',
        entityType: 'file',
        entityId: fileId,
        metadata: {
          fileName: fileName || updatedFile.name,
          fileSize: fileBuffer?.length,
          mimeType,
          provider: 'google'
        }
      }
    });

    return NextResponse.json({
      success: true,
      file: updatedFile,
      message: 'File updated successfully'
    });
  } catch (error) {
    console.error('Google Drive update error:', error);
    
    if (error instanceof Error && error.message.includes('File not found')) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to update file' },
      { status: 500 }
    );
  }
}

// DELETE /api/drive/files/[fileId] - Delete specific file from Google Drive
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { fileId } = await params;

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
    
    if (error instanceof Error && error.message.includes('File not found')) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}