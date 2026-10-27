// Google Drive Provider Implementation
import { Readable } from 'stream';
import { google } from 'googleapis';
import {
  BaseCloudProvider,
  CloudFile,
  UploadOptions,
  CloudStorageConfig,
  ListFilesOptions,
  ListFilesResult,
  UpdateFileInput,
  DriveAbout,
} from './types';
import { assertMediaDownloadAllowed } from '../google-drive-media';

export class GoogleDriveProvider extends BaseCloudProvider {
  private drive: any;
  private oauth2Client: any;
  private readonly refreshTokenValue?: string;

  constructor(config: CloudStorageConfig) {
    super(config);
    // Accept credentials either flat on the config or nested under `credentials`.
    const clientId = config.clientId ?? config.credentials?.clientId;
    const clientSecret = config.clientSecret ?? config.credentials?.clientSecret;
    const refreshToken = config.refreshToken ?? config.credentials?.refreshToken;
    const accessToken = config.accessToken ?? config.credentials?.accessToken;
    this.refreshTokenValue = refreshToken;

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    if (refreshToken || accessToken) {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
        access_token: accessToken,
      });
    }

    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  async authenticate(): Promise<boolean> {
    try {
      if (!this.refreshTokenValue) {
        throw new Error('No refresh token provided');
      }

      await this.refreshToken();
      return true;
    } catch (error) {
      console.error('Google Drive authentication failed:', error);
      return false;
    }
  }

  async refreshToken(): Promise<string> {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);
      return credentials.access_token;
    } catch (error) {
      throw new Error('Failed to refresh Google Drive token');
    }
  }

  async uploadFile(file: File | Buffer, options: UploadOptions): Promise<CloudFile> {
    try {
      const media = {
        mimeType: options.mimeType,
        body: Buffer.isBuffer(file) ? Readable.from(file) : file.stream(),
      };

      const fileMetadata = {
        name: options.fileName,
        parents: options.parentId ? [options.parentId] : undefined,
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, size, mimeType, createdTime, modifiedTime, parents',
      });

      return this.mapToCloudFile(response.data);
    } catch (error) {
      throw new Error(`Failed to upload file to Google Drive: ${error}`);
    }
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    try {
      // T092: `alt=media` on an `application/vnd.google-apps.*` file can only answer 403
      // fileNotDownloadable ("Only files with binary content can be downloaded. Use Export with
      // Docs Editors files."). The guard establishes the mime without alt=media and refuses first.
      await assertMediaDownloadAllowed(this.drive, fileId);

      const response = await this.drive.files.get({
        fileId: fileId,
        alt: 'media',
      });

      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Failed to download file from Google Drive: ${error}`);
    }
  }

  async deleteFile(fileId: string): Promise<boolean> {
    try {
      await this.drive.files.delete({
        fileId: fileId,
      });
      return true;
    } catch (error) {
      console.error('Failed to delete file from Google Drive:', error);
      return false;
    }
  }

  async getFile(fileId: string): Promise<CloudFile> {
    try {
      const response = await this.drive.files.get({
        fileId: fileId,
        fields: 'id, name, size, mimeType, createdTime, modifiedTime, parents, webViewLink, thumbnailLink',
      });

      return this.mapToCloudFile(response.data);
    } catch (error) {
      throw new Error(`Failed to get file from Google Drive: ${error}`);
    }
  }

  async listFiles(folderId?: string, limit: number = 100): Promise<CloudFile[]> {
    try {
      const query = folderId 
        ? `'${folderId}' in parents and trashed = false`
        : "trashed = false";

      const response = await this.drive.files.list({
        q: query,
        pageSize: limit,
        fields: 'files(id, name, size, mimeType, createdTime, modifiedTime, parents, webViewLink, thumbnailLink)',
      });

      return response.data.files.map((file: any) => this.mapToCloudFile(file));
    } catch (error) {
      throw new Error(`Failed to list files from Google Drive: ${error}`);
    }
  }

  async createFolder(name: string, parentId?: string): Promise<CloudFile> {
    try {
      const fileMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id, name, createdTime, modifiedTime, parents',
      });

      return this.mapToCloudFile(response.data);
    } catch (error) {
      throw new Error(`Failed to create folder in Google Drive: ${error}`);
    }
  }

  async deleteFolder(folderId: string): Promise<boolean> {
    return this.deleteFile(folderId);
  }

  async searchFiles(query: string, mimeType?: string): Promise<CloudFile[]> {
    try {
      let searchQuery = `name contains '${query}' and trashed = false`;
      if (mimeType) {
        searchQuery += ` and mimeType = '${mimeType}'`;
      }

      const response = await this.drive.files.list({
        q: searchQuery,
        fields: 'files(id, name, size, mimeType, createdTime, modifiedTime, parents, webViewLink, thumbnailLink)',
      });

      return response.data.files.map((file: any) => this.mapToCloudFile(file));
    } catch (error) {
      throw new Error(`Failed to search files in Google Drive: ${error}`);
    }
  }

  async getFileStream(fileId: string): Promise<NodeJS.ReadableStream> {
    try {
      // T092: same guard as downloadFile() - never open an alt=media request on an editors file.
      await assertMediaDownloadAllowed(this.drive, fileId);

      const response = await this.drive.files.get({
        fileId: fileId,
        alt: 'media',
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get file stream from Google Drive: ${error}`);
    }
  }

  async getQuota(): Promise<{ used: number; total: number }> {
    try {
      const response = await this.drive.about.get({
        fields: 'storageQuota',
      });

      const quota = response.data.storageQuota;
      return {
        used: parseInt(quota.usage || '0'),
        total: parseInt(quota.limit || '0'),
      };
    } catch (error) {
      throw new Error(`Failed to get Google Drive quota: ${error}`);
    }
  }

  async getProviderInfo(): Promise<{ name: string; version: string }> {
    return {
      name: 'Google Drive',
      version: 'v3',
    };
  }

  // Paginated list used by the Drive routes. Returns the normalised page shape.
  async listFilesPaged(options: ListFilesOptions = {}): Promise<ListFilesResult> {
    try {
      const { folderId, pageSize, pageToken, query } = options;

      const q = query
        ? query
        : folderId
          ? `'${folderId}' in parents and trashed = false`
          : 'trashed = false';

      const response = await this.drive.files.list({
        q,
        pageSize: pageSize ?? 100,
        pageToken,
        fields: 'nextPageToken, files(id, name, size, mimeType, createdTime, modifiedTime, parents, webViewLink, thumbnailLink)',
      });

      const files = (response.data.files ?? []).map((file: any) => this.mapToCloudFile(file));

      return {
        files,
        nextPageToken: response.data.nextPageToken ?? undefined,
      };
    } catch (error) {
      throw new Error(`Failed to list files from Google Drive: ${error}`);
    }
  }

  async updateFile(fileId: string, input: UpdateFileInput): Promise<CloudFile> {
    try {
      const requestBody: Record<string, unknown> = {
        resource: input.metadata ?? {},
        fileId,
        fields: 'id, name, size, mimeType, createdTime, modifiedTime, parents, webViewLink, thumbnailLink',
      };

      if (input.content) {
        requestBody.media = {
          mimeType: input.mimeType,
          body: Readable.from(input.content),
        };
      }

      const response = await this.drive.files.update(requestBody);
      return this.mapToCloudFile(response.data);
    } catch (error) {
      throw new Error(`Failed to update file in Google Drive: ${error}`);
    }
  }

  async getAbout(): Promise<DriveAbout> {
    try {
      const response = await this.drive.about.get({
        fields: 'user, storageQuota',
      });

      return {
        user: response.data.user,
        storageQuota: response.data.storageQuota,
      };
    } catch (error) {
      throw new Error(`Failed to get Google Drive info: ${error}`);
    }
  }

  private mapToCloudFile(driveFile: any): CloudFile {
    return {
      id: driveFile.id,
      name: driveFile.name,
      type: driveFile.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
      size: parseInt(driveFile.size || '0'),
      mimeType: driveFile.mimeType,
      createdAt: new Date(driveFile.createdTime),
      modifiedAt: new Date(driveFile.modifiedTime),
      path: `/${driveFile.name}`,
      downloadUrl: driveFile.webViewLink,
      thumbnailUrl: driveFile.thumbnailLink,
      provider: 'google',
      parentId: driveFile.parents?.[0],
      permissions: {
        canView: true,
        canEdit: true,
        canDelete: true,
        canShare: true,
      },
    };
  }
}