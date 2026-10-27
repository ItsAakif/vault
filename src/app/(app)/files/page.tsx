'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { 
  File, 
  FileText,
  Folder, 
  Search, 
  Upload, 
  Download, 
  Trash2, 
  RefreshCw, 
  Cloud,
  HardDrive,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { isRecord, readCollection } from '@/lib/api-collection';
import { formatBytes, formatDate } from '@/lib/utils';

interface CloudFile {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  mimeType: string;
  createdAt: string;
  modifiedAt: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  provider: 'google' | 'microsoft' | 'local';
  parentId?: string;
}

interface FileListResponse {
  success: boolean;
  files: CloudFile[];
  nextPageToken?: string;
  error?: string;
}

// T093: the list body is a response body, not a promise. A 200 that is an object without an array
// in `files` (or a bare `[]`, or `null`) used to reach `setFiles` and break `.map`; it is now the
// same error state as a failed request.
function isCloudFile(value: unknown): value is CloudFile {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isFileListResponse(value: unknown): value is FileListResponse {
  return isRecord(value) && value.success === true && Array.isArray(value.files);
}

function FilesContent() {
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [loading, setLoading] = useState(true);
  // True when the last fetch failed for a reason that is not a Drive failure (this surface is not
  // Drive-backed). Without it a failed request rendered the same "no files" state as an empty
  // account, which is the lie the shared error vocabulary exists to remove.
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const provider = searchParams.get('provider');
    if (provider) {
      setSelectedProvider(provider);
    }
    fetchFiles();
  }, [searchParams, currentFolder]);

  const fetchFiles = async (queryOverride?: string) => {
    try {
      setLoading(true);
      const provider = searchParams.get('provider') || selectedProvider;
      // `queryOverride` lets "Clear filter" refetch with an explicitly empty query instead of the
      // stale one still held in state for this render.
      const query = queryOverride ?? searchQuery;
      
      let url = '/api/files';
      const params = new URLSearchParams();
      
      if (provider && provider !== 'all') {
        if (provider === 'google') {
          url = '/api/drive/files';
        }
        // Add other providers here when implemented
      }
      
      if (currentFolder) {
        params.append('folderId', currentFolder);
      }
      
      if (query) {
        params.append('query', query);
      }
      
      if (params.toString()) {
        url += '?' + params.toString();
      }
      
      const response = await fetch(url);
      const body: unknown = await response.json();

      if (isFileListResponse(body)) {
        setFiles(readCollection(body.files, isCloudFile));
        setLoadError(false);
      } else {
        setLoadError(true);
        toast.error(
          isRecord(body) && typeof body.error === 'string' ? body.error : 'Failed to load files'
        );
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
      setLoadError(true);
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const triggerUpload = () => {
    document.getElementById('file-upload')?.click();
  };

  const clearSearch = () => {
    setSearchQuery('');
    fetchFiles('');
  };

  const handleSearch = () => {
    fetchFiles();
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Content = reader.result?.toString().split(',')[1];
        if (!base64Content) return;

        const provider = searchParams.get('provider') || selectedProvider;
        let uploadUrl = '/api/files';
        
        if (provider === 'google') {
          uploadUrl = '/api/drive/files';
        }

        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileName: file.name,
            fileContent: base64Content,
            mimeType: file.type,
            folderId: currentFolder
          })
        });

        const data = await response.json();
        
        if (data.success) {
          toast.success('File uploaded successfully');
          fetchFiles(); // Refresh the file list
        } else {
          toast.error(data.error || 'Upload failed');
        }
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      // Reset the input
      event.target.value = '';
    }
  };

  const handleDownload = async (file: CloudFile) => {
    try {
      const provider = searchParams.get('provider') || selectedProvider;
      let downloadUrl = `/api/files/${file.id}`;
      
      if (provider === 'google') {
        downloadUrl = `/api/drive/files/${file.id}?action=download`;
      }
      
      const response = await fetch(downloadUrl);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('File downloaded');
      } else {
        toast.error('Download failed');
      }
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Download failed');
    }
  };

  const handleDelete = async (file: CloudFile) => {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
      return;
    }

    try {
      const provider = searchParams.get('provider') || selectedProvider;
      let deleteUrl = `/api/files/${file.id}`;
      
      if (provider === 'google') {
        deleteUrl = `/api/drive/files/${file.id}`;
      }
      
      const response = await fetch(deleteUrl, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('File deleted successfully');
        fetchFiles(); // Refresh the file list
      } else {
        toast.error(data.error || 'Delete failed');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Delete failed');
    }
  };

  const getFileIcon = (file: CloudFile) => {
    if (file.type === 'folder') {
      return <Folder className="h-5 w-5 text-signal" />;
    }
    return <File className="h-5 w-5 text-ink-faint" />;
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'google':
        return <Cloud className="h-4 w-4 text-signal" />;
      case 'local':
        return <HardDrive className="h-4 w-4 text-ink-faint" />;
      default:
        return <Cloud className="h-4 w-4 text-ink-faint" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        className="p-0"
        title="Files"
        description="Manage your files across all connected storage providers"
        actions={
          <>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <Button
              onClick={triggerUpload}
              disabled={uploading}
            >
              {uploading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload File
            </Button>
            <Button variant="outline" onClick={() => fetchFiles()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </>
        }
      />

      {/* Search and Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1 flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} size="sm">
                Search
              </Button>
            </div>
            
            <Separator orientation="vertical" className="h-6" />
            
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="px-3 py-1 border rounded-md text-sm"
              >
                <option value="all">All Providers</option>
                <option value="google">Google Drive</option>
                <option value="local">Local Storage</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Files List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span>Files</span>
            {files.length > 0 && (
              <Badge variant="secondary">{files.length} items</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : loadError && files.length === 0 ? (
            <ErrorState
              title="Could not load your files"
              description="The server did not return a file list."
              onRetry={() => fetchFiles()}
            />
          ) : files.length === 0 ? (
            searchQuery ? (
              <EmptyState
                icon={Search}
                title="No files match that search"
                description="Try a shorter search or clear the filter."
                action={{ label: 'Clear filter', onClick: clearSearch }}
              />
            ) : (
              <EmptyState
                icon={FileText}
                title="No files yet"
                description="Upload a file to keep it alongside your notes and projects."
                action={{ label: 'Upload a file', onClick: triggerUpload }}
              />
            )
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center space-x-3 flex-1">
                    {getFileIcon(file)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span>{formatBytes(file.size)}</span>
                        <span>{formatDate(file.modifiedAt)}</span>
                        <div className="flex items-center space-x-1">
                          {getProviderIcon(file.provider)}
                          <span className="capitalize">{file.provider}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {file.type === 'file' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(file)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(file)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function FilesPage() {
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
      <FilesContent />
    </Suspense>
  );
}