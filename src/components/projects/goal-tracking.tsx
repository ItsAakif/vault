'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { 
  Target, 
  Plus, 
  Calendar, 
  TrendingUp, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Edit,
  Trash2
} from 'lucide-react'
import { format, formatDistanceToNow, isAfter, isBefore } from 'date-fns'

interface Goal {
  id: string
  title: string
  description?: string
  type: 'completion' | 'time' | 'quality' | 'custom'
  targetValue: number
  currentValue: number
  unit: string
  deadline?: Date
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'CANCELLED'
  createdAt: Date
  updatedAt: Date
}

interface GoalTrackingProps {
  projectId: string
  goals: Goal[]
  onCreateGoal: (goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>) => void
  onUpdateGoal: (goalId: string, updates: Partial<Goal>) => void
  onDeleteGoal: (goalId: string) => void
}

export function GoalTracking({ 
  projectId, 
  goals, 
  onCreateGoal, 
  onUpdateGoal, 
  onDeleteGoal 
}: GoalTrackingProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
  const [editingGoal, setEditingGoal] = React.useState<Goal | null>(null)
  const [newGoal, setNewGoal] = React.useState({
    title: '',
    description: '',
    type: 'completion' as const,
    targetValue: 100,
    currentValue: 0,
    unit: '%',
    deadline: '',
    priority: 'MEDIUM' as const
  })

  const handleCreateGoal = () => {
    if (!newGoal.title.trim()) return

    onCreateGoal({
      title: newGoal.title,
      description: newGoal.description,
      type: newGoal.type,
      targetValue: newGoal.targetValue,
      currentValue: newGoal.currentValue,
      unit: newGoal.unit,
      deadline: newGoal.deadline ? new Date(newGoal.deadline) : undefined,
      priority: newGoal.priority,
      status: 'ACTIVE'
    })

    setNewGoal({
      title: '',
      description: '',
      type: 'completion',
      targetValue: 100,
      currentValue: 0,
      unit: '%',
      deadline: '',
      priority: 'MEDIUM'
    })
    setIsCreateDialogOpen(false)
  }

  const handleUpdateProgress = (goalId: string, newValue: number) => {
    const goal = goals.find(g => g.id === goalId)
    if (!goal) return

    const status = newValue >= goal.targetValue ? 'COMPLETED' : 'ACTIVE'
    onUpdateGoal(goalId, { currentValue: newValue, status })
  }

  const getGoalProgress = (goal: Goal) => {
    return Math.min(100, (goal.currentValue / goal.targetValue) * 100)
  }

  const getGoalStatus = (goal: Goal) => {
    if (goal.status === 'COMPLETED') return { color: 'default', text: 'Completed' }
    if (goal.status === 'PAUSED') return { color: 'secondary', text: 'Paused' }
    if (goal.status === 'CANCELLED') return { color: 'destructive', text: 'Cancelled' }
    
    if (goal.deadline) {
      const now = new Date()
      if (isAfter(now, goal.deadline)) {
        return { color: 'destructive', text: 'Overdue' }
      } else if (formatDistanceToNow(goal.deadline).includes('day')) {
        return { color: 'secondary', text: 'Due Soon' }
      }
    }
    
    return { color: 'outline', text: 'Active' }
  }

  const getTypeIcon = (type: Goal['type']) => {
    switch (type) {
      case 'completion':
        return <CheckCircle className="h-4 w-4" />
      case 'time':
        return <Clock className="h-4 w-4" />
      case 'quality':
        return <TrendingUp className="h-4 w-4" />
      default:
        return <Target className="h-4 w-4" />
    }
  }

  const activeGoals = goals.filter(g => g.status === 'ACTIVE')
  const completedGoals = goals.filter(g => g.status === 'COMPLETED')
  const overallProgress = goals.length > 0 
    ? (completedGoals.length / goals.length) * 100 
    : 0

  return (
    <div className="space-y-6">
      {/* Header with Summary */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Goal Tracking</h3>
          <p className="text-sm text-muted-foreground">
            {completedGoals.length} of {goals.length} goals completed ({overallProgress.toFixed(0)}%)
          </p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Goal</DialogTitle>
              <DialogDescription>
                Set a specific, measurable goal for your project
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Goal Title</Label>
                <Input
                  id="title"
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                  placeholder="e.g., Complete all high priority tasks"
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={newGoal.description}
                  onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                  placeholder="Additional details about this goal..."
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="type">Goal Type</Label>
                  <Select 
                    value={newGoal.type} 
                    onValueChange={(value: any) => setNewGoal({ ...newGoal, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="completion">Completion %</SelectItem>
                      <SelectItem value="time">Time-based</SelectItem>
                      <SelectItem value="quality">Quality Metric</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select 
                    value={newGoal.priority} 
                    onValueChange={(value: any) => setNewGoal({ ...newGoal, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="targetValue">Target Value</Label>
                  <Input
                    id="targetValue"
                    type="number"
                    value={newGoal.targetValue}
                    onChange={(e) => setNewGoal({ ...newGoal, targetValue: Number(e.target.value) })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    value={newGoal.unit}
                    onChange={(e) => setNewGoal({ ...newGoal, unit: e.target.value })}
                    placeholder="%, hours, tasks, etc."
                  />
                </div>
                
                <div>
                  <Label htmlFor="deadline">Deadline (Optional)</Label>
                  <Input
                    id="deadline"
                    type="date"
                    value={newGoal.deadline}
                    onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
                  />
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateGoal}>
                Create Goal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Overall Progress */}
      {goals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Overall Goal Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{overallProgress.toFixed(0)}%</span>
              </div>
              <Progress value={overallProgress} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{activeGoals.length} active goals</span>
                <span>{completedGoals.length} completed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Goals List */}
      <div className="space-y-4">
        {goals.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Target className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Goals Set</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first goal to start tracking project progress
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Goal
              </Button>
            </CardContent>
          </Card>
        ) : (
          goals.map((goal) => {
            const progress = getGoalProgress(goal)
            const status = getGoalStatus(goal)
            
            return (
              <Card key={goal.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        {getTypeIcon(goal.type)}
                      </div>
                      <div>
                        <CardTitle className="text-base">{goal.title}</CardTitle>
                        {goal.description && (
                          <CardDescription className="mt-1">
                            {goal.description}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge variant={status.color as any}>
                        {status.text}
                      </Badge>
                      <Badge variant="outline">
                        {goal.priority}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-4">
                    {/* Progress */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Progress</span>
                        <span>
                          {goal.currentValue} / {goal.targetValue} {goal.unit}
                        </span>
                      </div>
                      <Progress value={progress} />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>{progress.toFixed(0)}% complete</span>
                        {goal.deadline && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDistanceToNow(goal.deadline)} remaining
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Quick Update */}
                    {goal.status === 'ACTIVE' && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`progress-${goal.id}`} className="text-sm">
                          Update Progress:
                        </Label>
                        <Input
                          id={`progress-${goal.id}`}
                          type="number"
                          min="0"
                          max={goal.targetValue}
                          value={goal.currentValue}
                          onChange={(e) => handleUpdateProgress(goal.id, Number(e.target.value))}
                          className="w-20"
                        />
                        <span className="text-sm text-muted-foreground">
                          {goal.unit}
                        </span>
                      </div>
                    )}
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingGoal(goal)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      
                      {goal.status === 'ACTIVE' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onUpdateGoal(goal.id, { 
                            status: goal.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' 
                          })}
                        >
                          {goal.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDeleteGoal(goal.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}