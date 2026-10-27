'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { File as FileType } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileUpload } from './file-upload'
import { FileManager } from './file-manager'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { log } from '@/lib/production-logger'
import {
  Paperclip,
  Upload,
  FolderOpen,
  File,
  Image,
  FileText,
  Music,
  Video,
  Download,
  Eye,
  Trash2,
  Link,
  ExternalLink
} from 'lucide-react'

interface FileAttachmentsProps {
  contentItemId: string
  contentTitle: string
  attachedFiles?: FileType[]
  onFilesChange?: (files: FileType[]) => void
  className?: string
  readOnly?: boolean
}

export function FileAttachments({
  contentItemId,
  contentTitle,
  attachedFiles = [],
  onFilesChange,
  className = '',
  readOnly = false
}: FileAttachmentsProps) {
  const [files, setFiles] = useState<FileType[]>(attachedFiles)
  const [loading, setLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [activeTab, setActiveTab] = useState('attached')
  const { toast } = useToast()

  useEffect(() => {
    setFiles(attachedFiles)
  }, [attachedFiles])

  const fetchAttachedFiles = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/content/${contentItemId}/files`)
      if (response.ok) {
        const data = await response.json()
        setFiles(data)
        onFilesChange?.(data)
        log.info('Attached files fetched', { contentItemId, fileCount: data.length })
      } else {
        log.error('Failed to fetch attached files', undefined, { 
          contentItemId, 
          status: response.status 
        })
      }
    } catch (error) {
      log.error('Error fetching attached files', error, { contentItemId })
      toast({
        title: 'Error',
        description: 'Failed to load attached files',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (uploadedFiles: FileType[]) => {
    try {
      // Attach files to content item
      const response = await fetch(`/api/content/${contentItemId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: uploadedFiles.map(file => file.id)
        })
      })

      if (response.ok) {
        const newFiles = [...files, ...uploadedFiles]
        setFiles(newFiles)
        onFilesChange?.(newFiles)
        
        log.user('files_attached_to_content', {
          contentItemId,
          fileCount: uploadedFiles.length,
          fileTypes: uploadedFiles.map(f => f.type)
        })
        
        toast({
          title: 'Success',
          description: `${uploadedFiles.length} file(s) attached successfully`
        })
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.message || 'Failed to attach files',
          variant: 'destructive'
        })
      }
    } catch (error) {
      log.error('Error attaching files', error, { contentItemId })
      toast({
        title: 'Error',
        description: 'Failed to attach files',
        variant: 'destructive'
      })
    }
  }

  const handleDetachFile = async (fileId: string) => {
    try {
      const response = await fetch(`/api/content/${contentItemId}/files/${fileId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        const newFiles = files.filter(file => file.id !== fileId)
        setFiles(newFiles)
        onFilesChange?.(newFiles)
        
        log.user('file_detached_from_content', { contentItemId, fileId })
        
        toast({
          title: 'Success',
          description: 'File detached successfully'
        })
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.message || 'Failed to detach file',
          variant: 'destructive'
        })
      }
    } catch (error) {
      log.error('Error detaching file', error, { contentItemId, fileId })
      toast({
        title: 'Error',
        description: 'Failed to detach file',
        variant: 'destructive'
      })
    }
  }

  const handleDownloadFile = (file: FileType) => {
    const downloadUrl = `/api/files/${file.id}/download`
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = file.originalName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    log.user('file_downloaded', { 
      fileId: file.id, 
      fileName: file.originalName,
      contentItemId 
    })
  }

  const handlePreviewFile = (file: FileType) => {
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      const previewUrl = `/api/files/${file.id}/preview`
      window.open(previewUrl, '_blank')
      
      log.user('file_previewed', { 
        fileId: file.id, 
        fileName: file.originalName,
        contentItemId 
      })
    }
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <Image className="h-4 w-4" />
    if (fileType.startsWith('audio/')) return <Music className="h-4 w-4" />
    if (fileType.startsWith('video/')) return <Video className="h-4 w-4" />
    if (fileType.includes('pdf') || fileType.includes('document') || fileType.includes('text')) {
      return <FileText className="h-4 w-4" />
    }
    return <File className="h-4 w-4" />
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const canPreview = (fileType: string) => {
    return fileType.startsWith('image/') || fileType === 'application/pdf'
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Compact File List */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Attachments ({files.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {files.slice(0, 3).map((file) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-2 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="text-muted-foreground">
                      {getFileIcon(file.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" title={file.originalName}>
                        {file.originalName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {canPreview(file.type) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreviewFile(file)}
                        className="h-7 w-7 p-0"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadFile(file)}
                      className="h-7 w-7 p-0"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDetachFile(file.id)}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
              
              {files.length > 3 && (
                <div className="text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setActiveTab('attached')
                      setShowDialog(true)
                    }}
                  >
                    +{files.length - 3} more files
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attach Files Button */}
      {!readOnly && (
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <Paperclip className="h-4 w-4 mr-2" />
              {files.length > 0 ? 'Manage Attachments' : 'Attach Files'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Paperclip className="h-5 w-5" />
                File Attachments for "{contentTitle}"
              </DialogTitle>
              <DialogDescription>
                Upload new files or attach existing files to this content item
              </DialogDescription>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="attached">Attached ({files.length})</TabsTrigger>
                <TabsTrigger value="upload">Upload New</TabsTrigger>
                <TabsTrigger value="browse">Browse Files</TabsTrigger>
              </TabsList>
              
              <TabsContent value="attached" className="mt-4">
                <ScrollArea className="h-96">
                  {files.length > 0 ? (
                    <div className="space-y-2">
                      {files.map((file) => (
                        <Card key={file.id}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="text-blue-500">
                                  {getFileIcon(file.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate" title={file.originalName}>
                                    {file.originalName}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {formatFileSize(file.size)} • {new Date(file.createdAt).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {canPreview(file.type) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePreviewFile(file)}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    Preview
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDownloadFile(file)}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  Download
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDetachFile(file.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Detach
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Paperclip className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No files attached</h3>
                      <p className="text-muted-foreground mb-4">
                        Upload new files or browse existing files to attach them
                      </p>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="upload" className="mt-4">
                <FileUpload
                  contentItemId={contentItemId}
                  onUploadComplete={(uploadedFiles) => {
                    handleFileUpload(uploadedFiles as unknown as FileType[])
                    setActiveTab('attached')
                  }}
                  maxFiles={10}
                  maxSize={50 * 1024 * 1024}
                />
              </TabsContent>
              
              <TabsContent value="browse" className="mt-4">
                <FileManager
                  onFileSelect={(file) => {
                    handleFileUpload([file])
                    setActiveTab('attached')
                  }}
                  className="h-96"
                />
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

export default FileAttachments