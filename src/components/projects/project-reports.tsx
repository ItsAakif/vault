'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePickerWithRange } from '@/components/ui/date-range-picker'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts'
import { 
  FileText,
  Download,
  Calendar,
  Clock,
  Target,
  TrendingUp,
  Users,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  PieChart as PieChartIcon,
  Activity
} from 'lucide-react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { DateRange } from 'react-day-picker'

interface ProjectReportsProps {
  projectId: string
  project: {
    id: string
    title: string
    description?: string
    status: string
    priority: string
    progress: number
    startDate?: Date
    endDate?: Date
    tasks: Array<{
      id: string
      title: string
      status: string
      priority: string
      estimatedHours?: number
      actualHours?: number
      completedAt?: Date
      createdAt: Date
    }>
    collaborators: Array<{
      id: string
      name: string
      role: string
    }>
    timeEntries: Array<{
      id: string
      duration: number
      date: Date
      description?: string
    }>
    goals: Array<{
      id: string
      title: string
      type: string
      targetValue: number
      currentValue: number
      status: string
    }>
  }
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export function ProjectReports({ projectId, project }: ProjectReportsProps) {
  const [reportType, setReportType] = React.useState<'summary' | 'detailed' | 'timeline' | 'performance'>('summary')
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>()
  const [exportFormat, setExportFormat] = React.useState<'pdf' | 'csv' | 'json'>('pdf')

  // Calculate report data
  const reportData = React.useMemo(() => {
    const totalTasks = project.tasks.length
    const completedTasks = project.tasks.filter(task => task.status === 'COMPLETED').length
    const inProgressTasks = project.tasks.filter(task => task.status === 'IN_PROGRESS').length
    const todoTasks = project.tasks.filter(task => task.status === 'TODO').length
    
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
    
    const totalEstimatedHours = project.tasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0)
    const totalActualHours = project.tasks.reduce((sum, task) => sum + (task.actualHours || 0), 0)
    
    const timeVariance = totalEstimatedHours > 0 
      ? ((totalActualHours - totalEstimatedHours) / totalEstimatedHours) * 100 
      : 0

    // Task completion over time
    const taskCompletionData = project.tasks
      .filter(task => task.completedAt)
      .reduce((acc: Record<string, number>, task) => {
        const date = format(new Date(task.completedAt!), 'yyyy-MM-dd')
        acc[date] = (acc[date] || 0) + 1
        return acc
      }, {})

    const completionChartData = Object.entries(taskCompletionData)
      .map(([date, count]) => ({
        date: format(new Date(date), 'MMM dd'),
        completed: count
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Priority distribution
    const priorityData = [
      { name: 'High', value: project.tasks.filter(t => t.priority === 'HIGH').length, color: '#FF8042' },
      { name: 'Medium', value: project.tasks.filter(t => t.priority === 'MEDIUM').length, color: '#FFBB28' },
      { name: 'Low', value: project.tasks.filter(t => t.priority === 'LOW').length, color: '#00C49F' }
    ].filter(item => item.value > 0)

    // Status distribution
    const statusData = [
      { name: 'Completed', value: completedTasks, color: '#00C49F' },
      { name: 'In Progress', value: inProgressTasks, color: '#0088FE' },
      { name: 'To Do', value: todoTasks, color: '#FFBB28' }
    ].filter(item => item.value > 0)

    // Time tracking data
    const timeTrackingData = project.timeEntries.reduce((acc: Record<string, number>, entry) => {
      const date = format(new Date(entry.date), 'yyyy-MM-dd')
      acc[date] = (acc[date] || 0) + (entry.duration / 60) // Convert to hours
      return acc
    }, {})

    const timeChartData = Object.entries(timeTrackingData)
      .map(([date, hours]) => ({
        date: format(new Date(date), 'MMM dd'),
        hours
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Goal progress
    const goalProgress = project.goals.map(goal => ({
      title: goal.title,
      progress: (goal.currentValue / goal.targetValue) * 100,
      status: goal.status
    }))

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
      charts: {
        completion: completionChartData,
        priority: priorityData,
        status: statusData,
        timeTracking: timeChartData,
        goals: goalProgress
      }
    }
  }, [project])

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          format: exportFormat,
          reportType,
          dateRange: dateRange ? {
            from: dateRange.from?.toISOString(),
            to: dateRange.to?.toISOString()
          } : undefined
        })
      })

      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.title}-report.${exportFormat}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Project Reports</h2>
          <p className="text-muted-foreground">
            Comprehensive reporting and analytics for {project.title}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={reportType} onValueChange={(value: any) => setReportType(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="summary">Summary</SelectItem>
              <SelectItem value="detailed">Detailed</SelectItem>
              <SelectItem value="timeline">Timeline</SelectItem>
              <SelectItem value="performance">Performance</SelectItem>
            </SelectContent>
          </Select>
          
          <DatePickerWithRange
            date={dateRange}
            onDateChange={setDateRange}
          />
          
          <Select value={exportFormat} onValueChange={(value: any) => setExportFormat(value)}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <Tabs value={reportType} onValueChange={(value: any) => setReportType(value)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary">
            <BarChart3 className="h-4 w-4 mr-2" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="detailed">
            <FileText className="h-4 w-4 mr-2" />
            Detailed
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <Calendar className="h-4 w-4 mr-2" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="performance">
            <TrendingUp className="h-4 w-4 mr-2" />
            Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          {/* Key Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{reportData.summary.completionRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  {reportData.summary.completedTasks} of {reportData.summary.totalTasks} tasks
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Time Efficiency</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {reportData.summary.timeVariance > 0 ? '+' : ''}{reportData.summary.timeVariance.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {reportData.summary.totalActualHours}h / {reportData.summary.totalEstimatedHours}h
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Size</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{project.collaborators.length}</div>
                <p className="text-xs text-muted-foreground">
                  Active collaborators
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Goals Progress</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {project.goals.filter(g => g.status === 'COMPLETED').length}/{project.goals.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Goals completed
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Task Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={reportData.charts.status}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {reportData.charts.status.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Priority Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={reportData.charts.priority}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="detailed" className="space-y-4">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Task Breakdown</CardTitle>
                <CardDescription>
                  Detailed analysis of all project tasks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {project.tasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <h4 className="font-medium">{task.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={task.status === 'COMPLETED' ? 'default' : 'secondary'}>
                            {task.status}
                          </Badge>
                          <Badge variant="outline">
                            {task.priority}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Created {format(new Date(task.createdAt), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {task.actualHours || 0}h / {task.estimatedHours || 0}h
                        </div>
                        {task.estimatedHours && task.actualHours && (
                          <div className={`text-xs ${
                            task.actualHours > task.estimatedHours ? 'text-orange-500' : 'text-green-500'
                          }`}>
                            {task.actualHours > task.estimatedHours ? 'Over' : 'Under'} estimate
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Team Contributions</CardTitle>
                <CardDescription>
                  Collaborator roles and contributions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {project.collaborators.map((collaborator) => (
                    <div key={collaborator.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">
                          {collaborator.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-medium">{collaborator.name}</h4>
                          <p className="text-sm text-muted-foreground">{collaborator.role}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Task Completion Timeline</CardTitle>
              <CardDescription>
                Tasks completed over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={reportData.charts.completion}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="completed" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Time Tracking Performance</CardTitle>
              <CardDescription>
                Daily time logged on the project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={reportData.charts.timeTracking}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="hours" 
                    stroke="#8884d8" 
                    fill="#8884d8" 
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Goal Progress</CardTitle>
              <CardDescription>
                Current progress on project goals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {reportData.charts.goals.map((goal, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{goal.title}</span>
                      <span>{goal.progress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, goal.progress)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Status: {goal.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}