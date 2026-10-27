'use client'

import { useState, useEffect } from 'react'
import { File as FileType } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { 
  File, 
  Image, 
  FileText, 
  Music, 
  Video, 
  Download, 
  Eye, 
  Trash2, 
  MoreHorizontal,
  Search,
  Grid,
  List,
  Calendar,
  HardDrive
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { log } from '@/lib/production-logger'
import { FileUpload } from './file-upload'

interface FileManagerProps {
  contentItemId?: string
  onFileSelect?: (file: FileType) => void
  onFileDelete?: (fileId: string) => void
  className?: string
}

interface FileWithItem extends FileType {
  contentItem?: {
    id: string
    title: string
  }
}

export function FileManager({
  contentItemId,
  onFileSelect,
  onFileDelete,
  className = ''
}: FileManagerProps) {
  const [files, setFiles] = useState<FileWithItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUploader, setShowUploader] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date' | 'type'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filterType, setFilterType] = useState<'all' | 'image' | 'document' | 'audio' | 'video'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])  
  const [totalSize, setTotalSize] = useState(0)
  
  const { toast } = useToast()

  useEffect(() => {
    fetchFiles()
  }, [contentItemId])

  const fetchFiles = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (contentItemId) {
        params.append('contentItemId', contentItemId)
      }
      
      const response = await fetch(`/api/files?${params}`)
      if (response.ok) {
        const data = await response.json()
        setFiles(data)
        
        // Calculate total size
        const total = data.reduce((sum: number, file: FileWithItem) => sum + file.size, 0)
        setTotalSize(total)
        
        log.info('Files fetched successfully', { fileCount: data.length, totalSize: total })
      } else {
        log.error('Failed to fetch files', undefined, { status: response.status })
      }
    } catch (error) {
      log.error('Error fetching files', error)
      toast({
        title: 'Error',
        description: 'Failed to load files',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFileUploadSuccess = (uploadedFiles: FileType[]) => {
    setFiles(prev => [...uploadedFiles, ...prev])
    setShowUploader(false)
    
    // Update total size
    const newSize = uploadedFiles.reduce((sum, file) => sum + file.size, 0)
    setTotalSize(prev => prev + newSize)
    
    log.user('files_uploaded', { count: uploadedFiles.length, totalSize: newSize })
    
    toast({
      title: 'Success',
      description: `${uploadedFiles.length} file(s) uploaded successfully`
    })
  }

  const handleDeleteFile = async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setFiles(prev => prev.filter(file => file.id !== fileId))
        onFileDelete?.(fileId)
        
        toast({
          title: 'Success',
          description: 'File deleted successfully'
        })
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.error || 'Failed to delete file',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete file',
        variant: 'destructive'
      })
    }
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <Image className="h-8 w-8" />
    if (fileType.startsWith('audio/')) return <Music className="h-8 w-8" />
    if (fileType.startsWith('video/')) return <Video className="h-8 w-8" />
    if (fileType.includes('pdf') || fileType.includes('document') || fileType.includes('text')) {
      return <FileText className="h-8 w-8" />
    }
    return <File className="h-8 w-8" />
  }

  const getFileType = (mimeType: string): 'image' | 'document' | 'audio' | 'video' | 'other' => {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document'
    return 'other'
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const filteredAndSortedFiles = files
    .filter(file => {
      // Search filter
      if (searchQuery && !file.originalName.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      
      // Type filter
      if (filterType !== 'all' && getFileType(file.type) !== filterType) {
        return false
      }
      
      return true
    })
    .sort((a, b) => {
      let compareValue = 0
      
      switch (sortBy) {
        case 'name':
          compareValue = a.originalName.localeCompare(b.originalName)
          break
        case 'size':
          compareValue = a.size - b.size
          break
        case 'date':
          compareValue = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'type':
          compareValue = a.type.localeCompare(b.type)
          break
      }
      
      return sortOrder === 'asc' ? compareValue : -compareValue
    })

  const FileCard = ({ file }: { file: FileWithItem }) => (
    <Card className="group hover:shadow-md transition-shadow cursor-pointer">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="text-blue-500">
              {getFileIcon(file.type)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm truncate" title={file.originalName}>
                {file.originalName}
              </h3>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => window.open(file.path, '_blank')}
              >
                <Eye className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = file.path
                  link.download = file.originalName
                  link.click()
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onFileSelect?.(file)}
              >
                <File className="h-4 w-4 mr-2" />
                Select
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDeleteFile(file.id)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {file.thumbnail && (
          <div className="mb-3">
            <img
              src={file.thumbnail}
              alt={file.originalName}
              className="w-full h-32 object-cover rounded"
            />
          </div>
        )}
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(file.createdAt.toString())}</span>
          </div>
          
          <Badge variant="outline" className="text-xs">
            {getFileType(file.type)}
          </Badge>
        </div>
        
        {file.contentItem && (
          <div className="mt-2 text-xs text-muted-foreground">
            Attached to: {file.contentItem.title}
          </div>
        )}
      </CardContent>
    </Card>
  )

  const FileListItem = ({ file }: { file: FileWithItem }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="text-blue-500 flex-shrink-0">
            {getFileIcon(file.type)}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-medium text-sm truncate" title={file.originalName}>
                {file.originalName}
              </h3>
              
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {getFileType(file.type)}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {formatFileSize(file.size)}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(file.createdAt.toString())}</span>
                </div>
                
                {file.contentItem && (
                  <span>
                    Attached to: {file.contentItem.title}
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-1">
                <HardDrive className="h-3 w-3" />
                <span>{formatFileSize(file.size)}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(file.path, '_blank')}
            >
              <Eye className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const link = document.createElement('a')
                link.href = file.path
                link.download = file.originalName
                link.click()
              }}
            >
              <Download className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteFile(file.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="animate-pulse space-y-3">
                    <div className="h-8 bg-muted rounded"></div>
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-32 bg-muted rounded"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Files</CardTitle>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-48"
              />
            </div>
            
            <Select value={filterType} onValueChange={(value) => setFilterType(value as any)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="image">Images</SelectItem>
                <SelectItem value="document">Documents</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="video">Video</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
              const [field, order] = value.split('-')
              setSortBy(field as any)
              setSortOrder(order as any)
            }}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                <SelectItem value="size-asc">Size (Smallest)</SelectItem>
                <SelectItem value="size-desc">Size (Largest)</SelectItem>
                <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                <SelectItem value="date-desc">Date (Newest)</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="flex border rounded">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-r-none"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-l-none"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {filteredAndSortedFiles.length === 0 ? (
          <div className="text-center py-8">
            <File className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No files found</h3>
            <p className="text-muted-foreground">
              {searchQuery || filterType !== 'all'
                ? 'Try adjusting your filters'
                : 'Upload files to get started'
              }
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAndSortedFiles.map(file => (
              <FileCard key={file.id} file={file} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAndSortedFiles.map(file => (
              <FileListItem key={file.id} file={file} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}