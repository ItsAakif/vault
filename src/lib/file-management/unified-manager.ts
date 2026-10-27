// Unified File Management System
// Integrates local storage, Google Drive, OneDrive, and other providers

import { CloudStorageProvider, CloudFile, UploadOptions } from '@/lib/cloud-storage/types';
import { GoogleDriveProvider } from '@/lib/cloud-storage/google-drive';
import { db } from '@/lib/db';
import { writeFile, readFile, unlink, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export interface FileMetadata {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  provider: 'local' | 'google' | 'microsoft';
  providerId?: string; // ID in the cloud provider
  userId: string;
  folderId?: string;
  tags: string[];
  isPublic: boolean;
  downloadCount: number;
  createdAt: Date;
  updatedAt: Date;
  checksum?: string;
}

export interface FileSearchOptions {
  query?: string;
  mimeType?: string;
  provider?: string;
  folderId?: string;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface FileOperationResult {
  success: boolean;
  file?: FileMetadata;
  error?: string;
}

export class UnifiedFileManager {
  private providers: Map<string, CloudStorageProvider> = new Map();
  private uploadDir: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
    this.ensureUploadDirectory();
    this.initializeProviders();
  }

  private async ensureUploadDirectory() {
    if (!existsSync(this.uploadDir)) {
      await mkdir(this.uploadDir, { recursive: true });
    }
  }

  private initializeProviders() {
    // Initialize Google Drive if credentials are available
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      const googleProvider = new GoogleDriveProvider({
        provider: 'google',
        credentials: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      });
      this.providers.set('google', googleProvider);
    }
  }

  // Upload file to specified provider
  async uploadFile(
    file: File | Buffer,
    options: {
      fileName: string;
      userId: string;
      provider?: 'local' | 'google' | 'microsoft';
      folderId?: string;
      tags?: string[];
      isPublic?: boolean;
      contentItemId?: string;
    }
  ): Promise<FileOperationResult> {
    try {
      const provider = options.provider || 'local';
      const fileId = this.generateFileId();
      const sanitizedFileName = this.sanitizeFileName(options.fileName);
      
      let fileMetadata: FileMetadata;

      if (provider === 'local') {
        // Handle local storage
        const result = await this.uploadToLocal(file, {
          ...options,
          fileName: sanitizedFileName,
          fileId,
        });
        fileMetadata = result;
      } else {
        // Handle cloud storage
        const cloudProvider = this.providers.get(provider);
        if (!cloudProvider) {
          return { success: false, error: `Provider ${provider} not available` };
        }

        const cloudFile = await cloudProvider.uploadFile(file, {
          fileName: sanitizedFileName,
          mimeType: this.getMimeType(sanitizedFileName),
          parentId: options.folderId,
        });

        fileMetadata = await this.createFileRecord({
          ...options,
          fileName: sanitizedFileName,
          fileId,
          provider,
          providerId: cloudFile.id,
          size: cloudFile.size,
          mimeType: cloudFile.mimeType,
        });
      }

      return { success: true, file: fileMetadata };
    } catch (error) {
      console.error('File upload error:', error);
      return { success: false, error: 'File upload failed' };
    }
  }

  // Upload to local storage
  private async uploadToLocal(
    file: File | Buffer,
    options: {
      fileName: string;
      userId: string;
      fileId: string;
      folderId?: string;
      tags?: string[];
      isPublic?: boolean;
    }
  ): Promise<FileMetadata> {
    const fileBuffer = file instanceof File ? 
      Buffer.from(await file.arrayBuffer()) : file;
    
    const userDir = join(this.uploadDir, options.userId);
    if (!existsSync(userDir)) {
      await mkdir(userDir, { recursive: true });
    }

    const filePath = join(userDir, `${options.fileId}-${options.fileName}`);
    await writeFile(filePath, fileBuffer);

    const stats = await stat(filePath);
    const checksum = await this.calculateChecksum(fileBuffer);

    return await this.createFileRecord({
      ...options,
      provider: 'local',
      size: stats.size,
      mimeType: this.getMimeType(options.fileName),
      path: filePath,
      checksum,
    });
  }

  // Create file record in database
  private async createFileRecord(data: {
    fileName: string;
    userId: string;
    fileId: string;
    provider: 'local' | 'google' | 'microsoft';
    providerId?: string;
    size: number;
    mimeType: string;
    path?: string;
    checksum?: string;
    folderId?: string;
    tags?: string[];
    isPublic?: boolean;
    contentItemId?: string;
  }): Promise<FileMetadata> {
    const fileRecord = await db.file.create({
      data: {
        id: data.fileId,
        name: data.fileName,
        originalName: data.fileName,
        type: data.mimeType,
        size: data.size,
        path: data.path || '',
        provider: data.provider,
        providerId: data.providerId,
        userId: data.userId,
        tags: JSON.stringify(data.tags || []),
        isPublic: data.isPublic || false,
        downloadCount: 0,
        checksum: data.checksum,
        contentItemId: data.contentItemId || null,
      },
    });

    return this.mapDbFileToMetadata(fileRecord);
  }

  private mapDbFileToMetadata(file: any): FileMetadata {
    return {
      id: file.id,
      name: file.name,
      originalName: file.originalName,
      mimeType: file.type || '',
      size: file.size,
      path: file.path,
      provider: file.provider as any,
      providerId: file.providerId || undefined,
      userId: file.userId,
      folderId: file.folderId || undefined,
      tags: (() => {
        try {
          return JSON.parse(file.tags || '[]');
        } catch (e) {
          return [];
        }
      })(),
      isPublic: file.isPublic || false,
      downloadCount: file.downloadCount || 0,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      checksum: file.checksum || undefined,
    } as FileMetadata;
  }

  // Download file from any provider
  async downloadFile(fileId: string, userId: string): Promise<{
    success: boolean;
    buffer?: Buffer;
    metadata?: FileMetadata;
    error?: string;
  }> {
    try {
      const file = await db.file.findFirst({
        where: { id: fileId, userId },
      });

      if (!file) {
        return { success: false, error: 'File not found' };
      }

      let buffer: Buffer;

      if (file.provider === 'local') {
        buffer = await readFile(file.path);
      } else {
        const cloudProvider = this.providers.get(file.provider);
        if (!cloudProvider || !file.providerId) {
          return { success: false, error: `Provider ${file.provider} not available` };
        }

        buffer = await cloudProvider.downloadFile(file.providerId);
      }

      // Update download count
      await db.file.update({
        where: { id: fileId },
        data: { downloadCount: { increment: 1 } },
      });

      return {
        success: true,
        buffer,
        metadata: file ? this.mapDbFileToMetadata(file) : undefined,
      };
    } catch (error) {
      console.error('File download error:', error);
      return { success: false, error: 'File download failed' };
    }
  }

  // Delete file from any provider
  async deleteFile(fileId: string, userId: string): Promise<FileOperationResult> {
    try {
      const file = await db.file.findFirst({
        where: { id: fileId, userId },
      });

      if (!file) {
        return { success: false, error: 'File not found' };
      }

      // Delete from storage provider
      if (file.provider === 'local') {
        if (existsSync(file.path)) {
          await unlink(file.path);
        }
      } else {
        const cloudProvider = this.providers.get(file.provider);
        if (cloudProvider && file.providerId) {
          await cloudProvider.deleteFile(file.providerId);
        }
      }

      // Delete from database
      await db.file.delete({
        where: { id: fileId },
      });

      return { success: true };
    } catch (error) {
      console.error('File delete error:', error);
      return { success: false, error: 'File deletion failed' };
    }
  }

  // Search files across all providers
  async searchFiles(userId: string, options: FileSearchOptions = {}): Promise<{
    files: FileMetadata[];
    total: number;
  }> {
    const where: any = { userId };

    if (options.query) {
      where.OR = [
        { name: { contains: options.query } },
        { originalName: { contains: options.query } },
      ];
    }

    if (options.mimeType) {
      where.mimeType = { contains: options.mimeType };
    }

    if (options.provider) {
      where.provider = options.provider;
    }

    if (options.folderId) {
      where.folderId = options.folderId;
    }

    if (options.tags && options.tags.length > 0) {
      where.tags = { hasSome: options.tags };
    }

    if (options.dateFrom || options.dateTo) {
      where.createdAt = {};
      if (options.dateFrom) where.createdAt.gte = options.dateFrom;
      if (options.dateTo) where.createdAt.lte = options.dateTo;
    }

    const [files, total] = await Promise.all([
      db.file.findMany({
        where,
        skip: options.offset || 0,
        take: options.limit || 50,
        orderBy: { createdAt: 'desc' },
      }),
      db.file.count({ where }),
    ]);

    return {
      files: files.map(f => this.mapDbFileToMetadata(f)),
      total,
    };
  }

  // Sync files from cloud providers
  async syncCloudFiles(userId: string, provider: 'google' | 'microsoft'): Promise<{
    synced: number;
    errors: string[];
  }> {
    const cloudProvider = this.providers.get(provider);
    if (!cloudProvider) {
      return { synced: 0, errors: [`Provider ${provider} not available`] };
    }

    try {
      const cloudFiles = await cloudProvider.listFiles();
      const existingFiles = await db.file.findMany({
        where: { userId, provider },
        select: { providerId: true },
      });

      const existingProviderIds = new Set(
        existingFiles.map(f => f.providerId).filter(Boolean)
      );

      let synced = 0;
      const errors: string[] = [];

      for (const cloudFile of cloudFiles) {
        if (!existingProviderIds.has(cloudFile.id)) {
          try {
            await this.createFileRecord({
              fileName: cloudFile.name,
              userId,
              fileId: this.generateFileId(),
              provider,
              providerId: cloudFile.id,
              size: cloudFile.size,
              mimeType: cloudFile.mimeType,
            });
            synced++;
          } catch (error) {
            errors.push(`Failed to sync ${cloudFile.name}: ${error}`);
          }
        }
      }

      return { synced, errors };
    } catch (error) {
      return { synced: 0, errors: [`Sync failed: ${error}`] };
    }
  }

  // Get storage statistics
  async getStorageStats(userId: string): Promise<{
    totalFiles: number;
    totalSize: number;
    providerStats: Record<string, { files: number; size: number }>;
  }> {
    const files = await db.file.findMany({
      where: { userId },
      select: { provider: true, size: true },
    });

    const providerStats: Record<string, { files: number; size: number }> = {};
    let totalSize = 0;

    for (const file of files) {
      if (!providerStats[file.provider]) {
        providerStats[file.provider] = { files: 0, size: 0 };
      }
      providerStats[file.provider].files++;
      providerStats[file.provider].size += file.size;
      totalSize += file.size;
    }

    return {
      totalFiles: files.length,
      totalSize,
      providerStats,
    };
  }

  // Utility methods
  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  }

  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain',
      md: 'text/markdown',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }

  private async calculateChecksum(buffer: Buffer): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}

// Export singleton instance
export const fileManager = new UnifiedFileManager();