import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { fileManager } from '@/lib/file-management/unified-manager'

// GET /api/files - List files with search and filtering
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id
    const url = new URL(request.url)

    const searchOptions = {
      query: url.searchParams.get('q') || undefined,
      mimeType: url.searchParams.get('type') || undefined,
      provider: url.searchParams.get('provider') || undefined,
      folderId: url.searchParams.get('folder') || undefined,
      tags: url.searchParams.get('tags')?.split(',') || undefined,
      limit: parseInt(url.searchParams.get('limit') || '50'),
      offset: parseInt(url.searchParams.get('offset') || '0')
    }

    const result = await fileManager.searchFiles(userId, searchOptions)

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('File list error:', error)
    return NextResponse.json({ success: false, error: 'Failed to list files' }, { status: 500 })
  }
}

// POST /api/files - Upload single file
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id
    const formData = await request.formData()

    const file = formData.get('file') as File
    const provider = (formData.get('provider') as string) || 'local'
    const folderId = (formData.get('folderId') as string) || undefined
    const tags = (formData.get('tags') as string) || undefined
    const isPublic = formData.get('isPublic') === 'true'

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    const result = await fileManager.uploadFile(file, {
      fileName: file.name,
      userId,
      provider: provider as any,
      folderId,
      tags: tags ? tags.split(',') : [],
      isPublic
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result.file })
  } catch (error) {
    console.error('File upload error:', error)
    return NextResponse.json({ success: false, error: 'File upload failed' }, { status: 500 })
  }
}