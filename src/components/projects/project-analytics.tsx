'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Area,
  AreaChart
} from 'recharts'
import { 
  Calendar,
  Clock,
  Target,
  TrendingUp,
  Users,
  CheckCircle,
  AlertCircle,
  Download,
  FileText,
  BarChart3
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

interface ProjectAnalyticsProps {
  projectId: string
  project: {
    id: string
    title: string
    description?: string
    status: string
    priority: string
    progress: number
    estimatedHours?: number
    actualHours?: number
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
    }>
    timeEntries: Array<{
      id: string
      duration: number
      date: Date
      description?: string
    }>
    collaborators: Array<{
      id: string
      name: string
      role: string
    }>
  }
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export function ProjectAnalytics({ projectId, project }: ProjectAnalyticsProps) {
  // Calculate analytics data
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

  // Task status distribution data
  const taskStatusData = [
    { name: 'Completed', value: completedTasks, color: '#00C49F' },
    { name: 'In Progress', value: inProgressTasks, color: '#0088FE' },
    { name: 'To Do', value: todoTasks, color: '#FFBB28' }
  ].filter(item => item.value > 0)

  // Priority distribution data
  const priorityData = [
    { name: 'High', value: project.tasks.filter(t => t.priority === 'HIGH').length },
    { name: 'Medium', value: project.tasks.filter(t => t.priority === 'MEDIUM').length },
    { name: 'Low', value: project.tasks.filter(t => t.priority === 'LOW').length }
  ].filter(item => item.value > 0)

  // Time tracking data (last 30 days)
  const timeTrackingData = React.useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (29 - i))
      return {
        date: format(date, 'MMM dd'),
        hours: 0
      }
    })

    project.timeEntries.forEach(entry => {
      const entryDate = format(new Date(entry.date), 'MMM dd')
      const dayData = last30Days.find(day => day.date === entryDate)
      if (dayData) {
        dayData.hours += entry.duration / 60 // Convert minutes to hours
      }
    })

    return last30Days
  }, [project.timeEntries])

  // Velocity data (tasks completed per week)
  const velocityData = React.useMemo(() => {
    const last8Weeks = Array.from({ length: 8 }, (_, i) => {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - (7 * (7 - i)))
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 6)
      
      return {
        week: `Week ${8 - i}`,
        completed: project.tasks.filter(task => 
          task.completedAt && 
          new Date(task.completedAt) >= startDate && 
          new Date(task.completedAt) <= endDate
        ).length
      }
    })

    return last8Weeks
  }, [project.tasks])

  const handleExportReport = async (format: 'pdf' | 'csv' | 'json') => {
    try {
      const response = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format })
      })

      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.title}-analytics.${format}`
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
      {/* Header with Export Options */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Project Analytics</h2>
          <p className="text-muted-foreground">
            Insights and metrics for {project.title}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportReport('csv')}
          >
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportReport('json')}
          >
            <FileText className="h-4 w-4 mr-2" />
            JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportReport('pdf')}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            PDF Report
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Progress</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project.progress}%</div>
            <Progress value={project.progress} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {completedTasks} of {totalTasks} tasks completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Time Tracking</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalActualHours}h</div>
            <p className="text-xs text-muted-foreground">
              Estimated: {totalEstimatedHours}h
            </p>
            <div className="flex items-center mt-2">
              {timeVariance > 0 ? (
                <AlertCircle className="h-3 w-3 text-orange-500 mr-1" />
              ) : (
                <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
              )}
              <span className={`text-xs ${timeVariance > 0 ? 'text-orange-500' : 'text-green-500'}`}>
                {timeVariance > 0 ? '+' : ''}{timeVariance.toFixed(1)}% variance
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project.collaborators.length}</div>
            <p className="text-xs text-muted-foreground">
              Active collaborators
            </p>
            <div className="flex -space-x-2 mt-2">
              {project.collaborators.slice(0, 3).map((collaborator, index) => (
                <div
                  key={collaborator.id}
                  className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center border-2 border-background"
                  title={collaborator.name}
                >
                  {collaborator.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {project.collaborators.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center border-2 border-background">
                  +{project.collaborators.length - 3}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {project.endDate ? formatDistanceToNow(new Date(project.endDate)) : 'No deadline'}
            </div>
            <p className="text-xs text-muted-foreground">
              {project.endDate ? 'Time remaining' : 'Open-ended project'}
            </p>
            <Badge 
              variant={project.status === 'COMPLETED' ? 'default' : 'secondary'}
              className="mt-2"
            >
              {project.status}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Detailed Analytics */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="time">Time Tracking</TabsTrigger>
          <TabsTrigger value="velocity">Velocity</TabsTrigger>
          <TabsTrigger value="tasks">Task Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Task Status Distribution</CardTitle>
                <CardDescription>
                  Current status of all project tasks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={taskStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {taskStatusData.map((entry, index) => (
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
                <CardDescription>
                  Task distribution by priority level
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={priorityData}>
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

        <TabsContent value="time" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Time Tracking</CardTitle>
              <CardDescription>
                Hours logged per day over the last 30 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={timeTrackingData}>
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
        </TabsContent>

        <TabsContent value="velocity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Team Velocity</CardTitle>
              <CardDescription>
                Tasks completed per week over the last 8 weeks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={velocityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="completed" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    dot={{ fill: '#8884d8' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Task Completion Analysis</CardTitle>
              <CardDescription>
                Detailed breakdown of task performance
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
        </TabsContent>
      </Tabs>
    </div>
  )
}