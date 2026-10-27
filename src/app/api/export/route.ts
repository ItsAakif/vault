import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('type') || 'all'
    const format = searchParams.get('format') || 'json'

    let exportData: any = {}

    // Export content items
    if (entityType === 'all' || entityType === 'content') {
      const contentItems = await db.contentItem.findMany({
        where: { userId: session.user.id }
      })
      exportData.contentItems = contentItems
    }

    // Export projects
    if (entityType === 'all' || entityType === 'projects') {
      const projects = await db.project.findMany({
        where: { userId: session.user.id },
        include: {
          tasks: true,
          milestones: true
        }
      })
      exportData.projects = projects
    }

    // Export jobs
    if (entityType === 'all' || entityType === 'jobs') {
      const jobs = await db.jobOpportunity.findMany({
        where: { userId: session.user.id }
      })
      exportData.jobs = jobs
    }

    // Export calendar events
    if (entityType === 'all' || entityType === 'calendar') {
      const events = await db.calendarEvent.findMany({
        where: { userId: session.user.id }
      })
      exportData.calendarEvents = events
    }

    // Export categories
    if (entityType === 'all' || entityType === 'categories') {
      const categories = await db.category.findMany({
        where: { userId: session.user.id },
        include: {
          children: true
        }
      })
      exportData.categories = categories
    }

    // Export tags
    if (entityType === 'all' || entityType === 'tags') {
      const tags = await db.tag.findMany({
        where: { userId: session.user.id },
        include: {
          children: true
        }
      })
      exportData.tags = tags
    }

    // Add metadata
    exportData.metadata = {
      exportedAt: new Date().toISOString(),
      exportedBy: session.user.email,
      version: '1.0',
      entityType
    }

    if (format === 'json') {
      const jsonData = JSON.stringify(exportData, null, 2)
      
      return new NextResponse(jsonData, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="vault-export-${Date.now()}.json"`
        }
      })
    }

    return NextResponse.json(exportData)
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json(
      { error: 'Export failed' },
      { status: 500 }
    )
  }
}
