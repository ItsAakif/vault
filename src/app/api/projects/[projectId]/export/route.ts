import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { z } from 'zod'
import { format } from 'date-fns'

const exportSchema = z.object({
  format: z.enum(['pdf', 'csv', 'json'])
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { format } = exportSchema.parse(body)

    // Fetch project with all related data
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId: session.user.id
      },
      include: {
        tasks: {
          include: {
            timeEntries: true,
            children: true,
            dependsOn: true
          }
        },
        timeEntries: true,
        collaborators: {
          include: {
            user: true
          }
        },
        milestones: true
      }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Calculate analytics
    const analytics = calculateProjectAnalytics(project)

    switch (format) {
      case 'json':
        return generateJSONReport(project, analytics)
      case 'csv':
        return generateCSVReport(project, analytics)
      case 'pdf':
        return generatePDFReport(project, analytics)
      default:
        return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
    }
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json(
      { error: 'Failed to export project data' },
      { status: 500 }
    )
  }
}

function calculateProjectAnalytics(project: any) {
  const totalTasks = project.tasks.length
  const completedTasks = project.tasks.filter((task: any) => task.status === 'COMPLETED').length
  const inProgressTasks = project.tasks.filter((task: any) => task.status === 'IN_PROGRESS').length
  const todoTasks = project.tasks.filter((task: any) => task.status === 'TODO').length
  
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
  
  const totalEstimatedHours = project.tasks.reduce((sum: number, task: any) => 
    sum + (task.estimatedHours || 0), 0)
  const totalActualHours = project.tasks.reduce((sum: number, task: any) => 
    sum + (task.actualHours || 0), 0)
  
  const timeVariance = totalEstimatedHours > 0 
    ? ((totalActualHours - totalEstimatedHours) / totalEstimatedHours) * 100 
    : 0

  // Priority distribution
  const priorityDistribution = {
    high: project.tasks.filter((t: any) => t.priority === 'HIGH').length,
    medium: project.tasks.filter((t: any) => t.priority === 'MEDIUM').length,
    low: project.tasks.filter((t: any) => t.priority === 'LOW').length
  }

  // Time tracking by day (last 30 days)
  const timeByDay = project.timeEntries.reduce((acc: any, entry: any) => {
    const date = format(new Date(entry.createdAt), 'yyyy-MM-dd')
    acc[date] = (acc[date] || 0) + (entry.duration || 0)
    return acc
  }, {})

  return {
    summary: {
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      completionRate,
      totalEstimatedHours,
      totalActualHours,
      timeVariance
    },
    priorityDistribution,
    timeByDay,
    collaboratorCount: project.collaborators.length,
    milestoneCount: project.milestones.length
  }
}

function generateJSONReport(project: any, analytics: any) {
  const reportData = {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      priority: project.priority,
      progress: project.progress,
      startDate: project.startDate,
      endDate: project.endDate,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    },
    analytics,
    tasks: project.tasks.map((task: any) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      completedAt: task.completedAt,
      subtaskCount: task.subtasks.length,
      dependencyCount: task.dependencies.length
    })),
    collaborators: project.collaborators.map((collab: any) => ({
      id: collab.user.id,
      name: collab.user.name,
      email: collab.user.email,
      role: collab.role
    })),
    milestones: project.milestones,
    exportedAt: new Date().toISOString()
  }

  return new NextResponse(JSON.stringify(reportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${project.title}-report.json"`
    }
  })
}

function generateCSVReport(project: any, analytics: any) {
  const csvRows: string[] = []
  
  // Project summary
  csvRows.push('PROJECT SUMMARY')
  csvRows.push(`Title,${project.title}`)
  csvRows.push(`Status,${project.status}`)
  csvRows.push(`Priority,${project.priority}`)
  csvRows.push(`Progress,${project.progress}%`)
  csvRows.push(`Completion Rate,${analytics.summary.completionRate.toFixed(1)}%`)
  csvRows.push(`Total Tasks,${analytics.summary.totalTasks}`)
  csvRows.push(`Completed Tasks,${analytics.summary.completedTasks}`)
  csvRows.push(`Estimated Hours,${analytics.summary.totalEstimatedHours}`)
  csvRows.push(`Actual Hours,${analytics.summary.totalActualHours}`)
  csvRows.push(`Time Variance,${analytics.summary.timeVariance.toFixed(1)}%`)
  csvRows.push('')

  // Tasks
  csvRows.push('TASKS')
  csvRows.push('Title,Status,Priority,Estimated Hours,Actual Hours,Completed At')
  project.tasks.forEach((task: any) => {
    csvRows.push([
      task.title,
      task.status,
      task.priority,
      task.estimatedHours || 0,
      task.actualHours || 0,
      task.completedAt ? format(new Date(task.completedAt), 'yyyy-MM-dd') : ''
    ].join(','))
  })
  csvRows.push('')

  // Collaborators
  csvRows.push('COLLABORATORS')
  csvRows.push('Name,Email,Role')
  project.collaborators.forEach((collab: any) => {
    csvRows.push([
      collab.user.name,
      collab.user.email,
      collab.role
    ].join(','))
  })

  const csvContent = csvRows.join('\n')

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${project.title}-report.csv"`
    }
  })
}

async function generatePDFReport(project: any, analytics: any) {
  // For PDF generation, we'll create a simple HTML report
  // In a real implementation, you might use libraries like puppeteer or jsPDF
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Project Report: ${project.title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .metric-label { font-weight: bold; }
        .metric-value { color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .progress-bar { width: 100%; height: 20px; background-color: #f0f0f0; border-radius: 10px; }
        .progress-fill { height: 100%; background-color: #4CAF50; border-radius: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Project Analytics Report</h1>
        <h2>${project.title}</h2>
        <p>Generated on ${format(new Date(), 'MMMM dd, yyyy')}</p>
      </div>

      <div class="section">
        <h3>Project Overview</h3>
        <div class="metric">
          <span class="metric-label">Status:</span>
          <span class="metric-value">${project.status}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Priority:</span>
          <span class="metric-value">${project.priority}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Progress:</span>
          <span class="metric-value">${project.progress}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${project.progress}%"></div>
        </div>
      </div>

      <div class="section">
        <h3>Key Metrics</h3>
        <div class="metric">
          <span class="metric-label">Total Tasks:</span>
          <span class="metric-value">${analytics.summary.totalTasks}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Completed:</span>
          <span class="metric-value">${analytics.summary.completedTasks}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Completion Rate:</span>
          <span class="metric-value">${analytics.summary.completionRate.toFixed(1)}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">Estimated Hours:</span>
          <span class="metric-value">${analytics.summary.totalEstimatedHours}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Actual Hours:</span>
          <span class="metric-value">${analytics.summary.totalActualHours}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Time Variance:</span>
          <span class="metric-value">${analytics.summary.timeVariance.toFixed(1)}%</span>
        </div>
      </div>

      <div class="section">
        <h3>Task Breakdown</h3>
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Estimated Hours</th>
              <th>Actual Hours</th>
            </tr>
          </thead>
          <tbody>
            ${project.tasks.map((task: any) => `
              <tr>
                <td>${task.title}</td>
                <td>${task.status}</td>
                <td>${task.priority}</td>
                <td>${task.estimatedHours || 0}</td>
                <td>${task.actualHours || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="section">
        <h3>Team</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            ${project.collaborators.map((collab: any) => `
              <tr>
                <td>${collab.user.name}</td>
                <td>${collab.role}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `

  return new NextResponse(htmlContent, {
    headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': `attachment; filename="${project.title}-report.html"`
    }
  })
}