import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { fileManager } from '@/lib/file-management/unified-manager'

// POST /api/files/upload - Upload multiple files
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const contentItemId = (formData.get('contentItemId') as string) || undefined
    const provider = (formData.get('provider') as string) || 'local'
    const folderId = (formData.get('folderId') as string) || undefined
    const tags = (formData.get('tags') as string) || undefined

    if (!files || files.length === 0) {
      return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 })
    }

    if (files.length > 10) {
      return NextResponse.json({ success: false, error: 'Maximum 10 files allowed' }, { status: 400 })
    }

    const uploadResults: any[] = []
    const errors: any[] = []

    for (const file of files) {
      try {
        const result = await fileManager.uploadFile(file, {
          fileName: file.name,
          userId,
          provider: provider as any,
          folderId,
          tags: tags ? tags.split(',') : [],
          isPublic: false,
          contentItemId
        })

        if (!result.success) {
          errors.push({ filename: file.name, error: result.error })
          continue
        }

        uploadResults.push(result.file)
      } catch (err) {
        console.error('Error uploading file:', err)
        errors.push({ filename: file.name, error: 'Failed to upload file' })
      }
    }

    return NextResponse.json({ success: true, files: uploadResults, errors: errors.length ? errors : undefined })
  } catch (error) {
    console.error('Error in multi-file upload:', error)
    return NextResponse.json({ success: false, error: 'Failed to upload files' }, { status: 500 })
  }
}
