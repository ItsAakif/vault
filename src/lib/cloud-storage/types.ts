// Cloud Storage Interface - Unified file management
// Supports Google Drive, OneDrive, and local/personal storage

export interface CloudFile {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  mimeType: string;
  createdAt: Date;
  modifiedAt: Date;
  path: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  provider: 'google' | 'microsoft' | 'local';
  parentId?: string;
  permissions?: FilePermissions;
}

export interface FilePermissions {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
}

export interface CloudStorageConfig {
  provider: 'google' | 'microsoft' | 'local';
  // Flat OAuth credentials. Routes construct providers directly with these.
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  // Nested credentials are kept for the manager-based construction path.
  credentials?: {
    clientId: string;
    clientSecret: string;
    refreshToken?: string;
    accessToken?: string;
  };
  rootFolder?: string;
  syncEnabled?: boolean;
}

// Options accepted by the paginated list operation used by the Drive routes.
export interface ListFilesOptions {
  folderId?: string;
  pageSize?: number;
  pageToken?: string;
  query?: string;
}

// Normalised list response: the file page plus the provider's continuation token.
export interface ListFilesResult {
  files: CloudFile[];
  nextPageToken?: string;
}

export interface UpdateFileInput {
  metadata?: Record<string, unknown>;
  content?: Buffer;
  mimeType?: string;
}

export interface DriveAbout {
  user?: {
    emailAddress?: string;
    displayName?: string;
    photoLink?: string;
  };
  storageQuota?: {
    limit?: string;
    usage?: string;
    usageInDrive?: string;
  };
}

export interface UploadOptions {
  fileName: string;
  mimeType: string;
  parentId?: string;
  overwrite?: boolean;
  makePublic?: boolean;
}

export interface CloudStorageProvider {
  // Authentication
  authenticate(): Promise<boolean>;
  refreshToken(): Promise<string>;
  
  // File Operations
  uploadFile(file: File | Buffer, options: UploadOptions): Promise<CloudFile>;
  downloadFile(fileId: string): Promise<Buffer>;
  deleteFile(fileId: string): Promise<boolean>;
  getFile(fileId: string): Promise<CloudFile>;
  
  // Folder Operations
  listFiles(folderId?: string, limit?: number): Promise<CloudFile[]>;
  createFolder(name: string, parentId?: string): Promise<CloudFile>;
  deleteFolder(folderId: string): Promise<boolean>;
  
  // Search and Sync
  searchFiles(query: string, mimeType?: string): Promise<CloudFile[]>;
  getFileStream(fileId: string): Promise<NodeJS.ReadableStream>;
  
  // Metadata
  getQuota(): Promise<{ used: number; total: number }>;
  getProviderInfo(): Promise<{ name: string; version: string }>;
}

export abstract class BaseCloudProvider implements CloudStorageProvider {
  protected config: CloudStorageConfig;
  
  constructor(config: CloudStorageConfig) {
    this.config = config;
  }
  
  abstract authenticate(): Promise<boolean>;
  abstract refreshToken(): Promise<string>;
  abstract uploadFile(file: File | Buffer, options: UploadOptions): Promise<CloudFile>;
  abstract downloadFile(fileId: string): Promise<Buffer>;
  abstract deleteFile(fileId: string): Promise<boolean>;
  abstract getFile(fileId: string): Promise<CloudFile>;
  abstract listFiles(folderId?: string, limit?: number): Promise<CloudFile[]>;
  abstract createFolder(name: string, parentId?: string): Promise<CloudFile>;
  abstract deleteFolder(folderId: string): Promise<boolean>;
  abstract searchFiles(query: string, mimeType?: string): Promise<CloudFile[]>;
  abstract getFileStream(fileId: string): Promise<NodeJS.ReadableStream>;
  abstract getQuota(): Promise<{ used: number; total: number }>;
  abstract getProviderInfo(): Promise<{ name: string; version: string }>;
}

export class CloudStorageManager {
  private providers: Map<string, CloudStorageProvider> = new Map();
  
  registerProvider(name: string, provider: CloudStorageProvider) {
    this.providers.set(name, provider);
  }
  
  getProvider(name: string): CloudStorageProvider | undefined {
    return this.providers.get(name);
  }
  
  async syncFile(
    sourceProvider: string,
    targetProvider: string,
    fileId: string
  ): Promise<CloudFile> {
    const source = this.getProvider(sourceProvider);
    const target = this.getProvider(targetProvider);
    
    if (!source || !target) {
      throw new Error('Provider not found');
    }
    
    const fileBuffer = await source.downloadFile(fileId);
    const sourceFile = await source.getFile(fileId);
    
    return await target.uploadFile(fileBuffer, {
      fileName: sourceFile.name,
      mimeType: sourceFile.mimeType,
    });
  }
  
  async getAllFiles(): Promise<CloudFile[]> {
    const allFiles: CloudFile[] = [];
    
    for (const [name, provider] of this.providers) {
      try {
        const files = await provider.listFiles();
        allFiles.push(...files);
      } catch (error) {
        console.error(`Error fetching files from ${name}:`, error);
      }
    }
    
    return allFiles;
  }
}