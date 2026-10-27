'use client'

import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { 
  Upload, 
  File, 
  Image, 
  FileText, 
  Music, 
  Video, 
  X, 
  CheckCircle,
  AlertCircle,
  Download,
  Eye,
  Trash2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { log } from '@/lib/production-logger'

interface FileUploadProps {
  onUploadComplete?: (files: UploadedFile[]) => void
  contentItemId?: string
  maxFiles?: number
  acceptedTypes?: string[]
  maxSize?: number // in bytes
  className?: string
}

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  url: string
  thumbnail?: string
}

interface UploadProgress {
  file: File
  progress: number
  status: 'uploading' | 'completed' | 'error'
  error?: string
  result?: UploadedFile
}

export function FileUpload({
  onUploadComplete,
  contentItemId,
  maxFiles = 10,
  acceptedTypes,
  maxSize,
  className = ''
}: FileUploadProps) {
  const [uploads, setUploads] = useState<UploadProgress[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { toast } = useToast()

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    setIsUploading(true)
    
    // Check limits
    if (maxFiles && uploads.length + acceptedFiles.length > maxFiles) {
      toast({
        title: 'Too many files',
        description: `Maximum ${maxFiles} files allowed`,
        variant: 'destructive'
      })
      setIsUploading(false)
      return
    }

    const newUploads: UploadProgress[] = acceptedFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading' as const
    }))

    setUploads(prev => [...prev, ...newUploads])

    // Upload files
    const uploadPromises = acceptedFiles.map(async (file, index) => {
      const uploadIndex = uploads.length + index
      
      try {
        const formData = new FormData()
        formData.append('files', file)
        if (contentItemId) {
          formData.append('contentItemId', contentItemId)
        }

        const xhr = new XMLHttpRequest()
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100)
            setUploads(prev => prev.map((upload, i) => 
              i === uploadIndex ? { ...upload, progress } : upload
            ))
          }
        })

        // Create upload promise
        const uploadPromise = new Promise<UploadedFile[]>((resolve, reject) => {
          xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
              try {
                const response = JSON.parse(xhr.responseText)
                if (response.success) {
                  resolve(response.files)
                } else {
                  reject(new Error(response.error || 'Upload failed'))
                }
              } catch (error) {
                reject(new Error('Invalid response'))
              }
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`))
            }
          })

          xhr.addEventListener('error', () => {
            reject(new Error('Network error'))
          })

          xhr.addEventListener('abort', () => {
            reject(new Error('Upload cancelled'))
          })
        })

        xhr.open('POST', '/api/files')
        xhr.send(formData)

        const result = await uploadPromise

        // Update upload status
        setUploads(prev => prev.map((upload, i) => 
          i === uploadIndex ? { 
            ...upload, 
            status: 'completed',
            result: result[0]
          } : upload
        ))

        return result[0]

      } catch (error) {
        log.error('File upload error', error, { fileName: file.name, fileSize: file.size })
        
        setUploads(prev => prev.map((upload, i) => 
          i === uploadIndex ? { 
            ...upload, 
            status: 'error',
            error: error instanceof Error ? error.message : 'Upload failed'
          } : upload
        ))

        throw error
      }
    })

    try {
      const results = await Promise.all(uploadPromises)
      const successfulUploads = results.filter(Boolean) as UploadedFile[]
      
      if (successfulUploads.length > 0) {
        onUploadComplete?.(successfulUploads)
        
        toast({
          title: 'Upload complete',
          description: `${successfulUploads.length} file(s) uploaded successfully`
        })
      }
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: 'Some files failed to upload',
        variant: 'destructive'
      })
    } finally {
      setIsUploading(false)
    }
  }, [uploads.length, maxFiles, contentItemId, onUploadComplete, toast])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxFiles: maxFiles - uploads.length,
    accept: acceptedTypes?.reduce((acc, type) => {
      acc[type] = []
      return acc
    }, {} as Record<string, string[]>),
    disabled: isUploading || !!(maxFiles && uploads.length >= maxFiles)
  })

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <Image className="h-8 w-8" />
    if (fileType.startsWith('audio/')) return <Music className="h-8 w-8" />
    if (fileType.startsWith('video/')) return <Video className="h-8 w-8" />
    if (fileType.includes('pdf') || fileType.includes('document') || fileType.includes('text')) {
      return <FileText className="h-8 w-8" />
    }
    return <File className="h-8 w-8" />
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const removeUpload = (index: number) => {
    setUploads(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className={className}>
      {/* Drop Zone */}
      <Card 
        {...getRootProps()}
        className={`border-2 border-dashed transition-colors cursor-pointer ${
          isDragActive 
            ? 'border-primary bg-primary/5' 
            : 'border-muted-foreground/25 hover:border-primary/50'
        } ${isUploading || (maxFiles && uploads.length >= maxFiles) ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <CardContent className="p-8 text-center">
          <input {...getInputProps()} ref={fileInputRef} />
          
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          
          {isDragActive ? (
            <p className="text-lg font-medium">Drop files here...</p>
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-medium">
                Drag & drop files here, or click to select
              </p>
              <p className="text-sm text-muted-foreground">
                {maxFiles && `Up to ${maxFiles} files • `}
                {maxSize ? `Max ${formatFileSize(maxSize)}` : 'No size limit'}
              </p>
            </div>
          )}
          
          <Button 
            type="button" 
            variant="outline" 
            className="mt-4"
            disabled={isUploading || !!(maxFiles && uploads.length >= maxFiles)}
            onClick={(e) => {
              e.stopPropagation()
              fileInputRef.current?.click()
            }}
          >
            Browse Files
          </Button>
        </CardContent>
      </Card>

      {/* Upload Progress */}
      {uploads.length > 0 && (
        <div className="mt-4 space-y-3">
          {uploads.map((upload, index) => (
            <Card key={index} className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {getFileIcon(upload.file.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium truncate">
                      {upload.file.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {formatFileSize(upload.file.size)}
                      </Badge>
                      
                      {upload.status === 'uploading' && (
                        <Upload className="h-4 w-4 text-blue-500 animate-pulse" />
                      )}
                      {upload.status === 'completed' && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {upload.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => removeUpload(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  {upload.status === 'uploading' && (
                    <Progress value={upload.progress} className="h-2" />
                  )}
                  
                  {upload.status === 'error' && upload.error && (
                    <p className="text-xs text-red-500 mt-1">
                      {upload.error}
                    </p>
                  )}
                  
                  {upload.status === 'completed' && upload.result && (
                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => window.open(upload.result?.url, '_blank')}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          const link = document.createElement('a')
                          link.href = upload.result?.url || ''
                          link.download = upload.result?.name || upload.file.name
                          link.click()
                        }}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}