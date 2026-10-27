'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePickerWithRange } from '@/components/ui/date-range-picker'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ComposedChart
} from 'recharts'
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Clock, 
  Users, 
  AlertTriangle,
  CheckCircle,
  Calendar,
  Download,
  RefreshCw
} from 'lucide-react'
import { useProjectAnalytics } from '@/hooks/use-project-analytics'
import { format } from 'date-fns'
import { DateRange } from 'react-day-picker'

interface AnalyticsDashboardProps {
  projectId: string
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export function AnalyticsDashboard({ projectId }: AnalyticsDashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = React.useState<'week' | 'month' | 'quarter' | 'year'>('month')
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>()

  const {
    analytics,
    derivedMetrics,
    compareWithPrevious,
    isLoading,
    error,
    updateDateRange,
    getAnalyticsForPeriod,
    exportAnalytics,
    refetch
  } = useProjectAnalytics({ projectId })

  React.useEffect(() => {
    if (dateRange?.from && dateRange?.to) {
      updateDateRange(dateRange.from, dateRange.to)
    }
  }, [dateRange, updateDateRange])

  const handlePeriodChange = (period: 'week' | 'month' | 'quarter' | 'year') => {
    setSelectedPeriod(period)
    getAnalyticsForPeriod(period)
  }

  const handleExport = async (format: 'pdf' | 'csv' | 'json') => {
    const success = await exportAnalytics(format)
    if (!success) {
      // Handle error - could show toast notification
      console.error('Export failed')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (error || !analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-muted-foreground">Failed to load analytics</p>
          <Button variant="outline" onClick={() => refetch()} className="mt-2">
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  const { summary, priorityDistribution, timeByDay, velocity, burndown } = analytics

  // Convert timeByDay to chart data
  const timeChartData = Object.entries(timeByDay).map(([date, hours]) => ({
    date: format(new Date(date), 'MMM dd'),
    hours: hours / 60 // Convert minutes to hours
  }))

  // Priority chart data
  const priorityChartData = [
    { name: 'High', value: priorityDistribution.high, color: '#FF8042' },
    { name: 'Medium', value: priorityDistribution.medium, color: '#FFBB28' },
    { name: 'Low', value: priorityDistribution.low, color: '#00C49F' }
  ].filter(item => item.value > 0)

  // Status distribution data
  const statusData = [
    { name: 'Completed', value: summary.completedTasks, color: '#00C49F' },
    { name: 'In Progress', value: summary.inProgressTasks, color: '#0088FE' },
    { name: 'To Do', value: summary.todoTasks, color: '#FFBB28' }
  ].filter(item => item.value > 0)

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Analytics Dashboard</h2>
          <p className="text-muted-foreground">
            Comprehensive project insights and metrics
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>
          
          <DatePickerWithRange
            date={dateRange}
            onDateChange={setDateRange}
          />
          
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('pdf')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.completionRate.toFixed(1)}%</div>
            <Progress value={summary.completionRate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {summary.completedTasks} of {summary.totalTasks} tasks
            </p>
            {compareWithPrevious && (
              <div className="flex items-center mt-1">
                {compareWithPrevious.completionRateChange > 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500 mr-1" />
                )}
                <span className={`text-xs ${
                  compareWithPrevious.completionRateChange > 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {Math.abs(compareWithPrevious.completionRateChange).toFixed(1)}%
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Time Efficiency</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {derivedMetrics?.efficiency.toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.totalActualHours}h / {summary.totalEstimatedHours}h
            </p>
            <div className="flex items-center mt-2">
              {summary.timeVariance <= 0 ? (
                <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-orange-500 mr-1" />
              )}
              <span className={`text-xs ${
                summary.timeVariance <= 0 ? 'text-green-500' : 'text-orange-500'
              }`}>
                {summary.timeVariance > 0 ? '+' : ''}{summary.timeVariance.toFixed(1)}% variance
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Productivity Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {derivedMetrics?.productivityScore.toFixed(0)}
            </div>
            <Progress value={derivedMetrics?.productivityScore} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Overall project health
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Level</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge variant={
                derivedMetrics?.riskLevel === 'Low' ? 'default' :
                derivedMetrics?.riskLevel === 'Medium' ? 'secondary' : 'destructive'
              }>
                {derivedMetrics?.riskLevel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {derivedMetrics?.riskFactors.length || 0} risk factors
            </p>
            {derivedMetrics?.estimatedCompletionDate && (
              <p className="text-xs text-muted-foreground">
                ETA: {format(derivedMetrics.estimatedCompletionDate, 'MMM dd')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts and Detailed Analytics */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="time">Time Tracking</TabsTrigger>
          <TabsTrigger value="velocity">Velocity</TabsTrigger>
          <TabsTrigger value="burndown">Burndown</TabsTrigger>
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
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
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
                  <BarChart data={priorityChartData}>
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
                Hours logged per day over the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={timeChartData}>
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
                <LineChart data={velocity}>
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

        <TabsContent value="burndown" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Burndown Chart</CardTitle>
              <CardDescription>
                Actual vs ideal task completion over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={burndown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="ideal" 
                    stroke="#00C49F" 
                    strokeDasharray="5 5"
                    name="Ideal"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="remaining" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    name="Actual"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}