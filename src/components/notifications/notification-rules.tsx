'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { 
  Plus, 
  Settings, 
  Play, 
  Pause,
  Trash2,
  Copy,
  BarChart3,
  Zap,
  Clock,
  Filter,
  AlertTriangle,
  CheckCircle,
  XCircle
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface NotificationRule {
  id: string
  name: string
  description: string
  enabled: boolean
  trigger: any
  actions: any[]
  escalation?: any[]
  filters?: any[]
  createdAt: string
  updatedAt: string
}

export function NotificationRules() {
  const [rules, setRules] = useState<NotificationRule[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showAnalyticsDialog, setShowAnalyticsDialog] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    enabled: true,
    trigger: {
      type: 'event',
      event: {
        entityType: 'task',
        action: 'created',
        conditions: {}
      },
      time: undefined as { schedule?: string; timezone?: string } | undefined
    },
    actions: [{
      type: 'send_notification',
      config: {
        title: '',
        message: '',
        priority: 'medium',
        category: 'system'
      }
    }],
    escalation: [],
    filters: []
  })
  const { toast } = useToast()

  useEffect(() => {
    fetchRules()
    fetchTemplates()
    fetchAnalytics()
  }, [])

  const fetchRules = async () => {
    try {
      const response = await fetch('/api/notifications/rules')
      if (response.ok) {
        const data = await response.json()
        setRules(data)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch notification rules',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/notifications/rules/templates')
      if (response.ok) {
        const data = await response.json()
        setTemplates(data)
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/notifications/rules/analytics')
      if (response.ok) {
        const data = await response.json()
        setAnalytics(data)
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    }
  }

  const createRule = async () => {
    try {
      const response = await fetch('/api/notifications/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule)
      })

      if (response.ok) {
        const rule = await response.json()
        setRules(prev => [...prev, rule])
        setShowCreateDialog(false)
        resetNewRule()
        toast({
          title: 'Success',
          description: 'Notification rule created successfully'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create notification rule',
        variant: 'destructive'
      })
    }
  }

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/notifications/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      })

      if (response.ok) {
        setRules(prev => prev.map(rule => 
          rule.id === ruleId ? { ...rule, enabled } : rule
        ))
        toast({
          title: 'Success',
          description: `Rule ${enabled ? 'enabled' : 'disabled'} successfully`
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update rule',
        variant: 'destructive'
      })
    }
  }

  const deleteRule = async (ruleId: string) => {
    try {
      const response = await fetch(`/api/notifications/rules/${ruleId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setRules(prev => prev.filter(rule => rule.id !== ruleId))
        toast({
          title: 'Success',
          description: 'Rule deleted successfully'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete rule',
        variant: 'destructive'
      })
    }
  }

  const duplicateRule = async (rule: NotificationRule) => {
    const duplicatedRule = {
      ...rule,
      name: `${rule.name} (Copy)`,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined
    }

    try {
      const response = await fetch('/api/notifications/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicatedRule)
      })

      if (response.ok) {
        const newRule = await response.json()
        setRules(prev => [...prev, newRule])
        toast({
          title: 'Success',
          description: 'Rule duplicated successfully'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to duplicate rule',
        variant: 'destructive'
      })
    }
  }

  const applyTemplate = (template: any) => {
    setNewRule({
      ...newRule,
      ...template,
      enabled: true
    })
    setSelectedTemplate(template)
  }

  const resetNewRule = () => {
    setNewRule({
      name: '',
      description: '',
      enabled: true,
      trigger: {
        type: 'event',
        event: {
          entityType: 'task',
          action: 'created',
          conditions: {}
        },
        time: undefined as { schedule?: string; timezone?: string } | undefined
      },
      actions: [{
        type: 'send_notification',
        config: {
          title: '',
          message: '',
          priority: 'medium',
          category: 'system'
        }
      }],
      escalation: [],
      filters: []
    })
    setSelectedTemplate(null)
  }

  const getTriggerDescription = (trigger: any) => {
    switch (trigger.type) {
      case 'event':
        return `When ${trigger.event?.entityType} is ${trigger.event?.action}`
      case 'time':
        return `At ${trigger.time?.schedule}`
      case 'condition':
        return `When ${trigger.condition?.field} ${trigger.condition?.operator} ${trigger.condition?.value}`
      case 'user_action':
        return `When user ${trigger.userAction?.action}`
      default:
        return 'Unknown trigger'
    }
  }

  const getActionDescription = (action: any) => {
    switch (action.type) {
      case 'send_notification':
        return 'Send notification'
      case 'send_email':
        return 'Send email'
      case 'send_sms':
        return 'Send SMS'
      case 'create_task':
        return 'Create task'
      case 'update_status':
        return 'Update status'
      default:
        return 'Unknown action'
    }
  }

  const getRuleStatusIcon = (rule: NotificationRule) => {
    if (!rule.enabled) {
      return <Pause className="h-4 w-4 text-gray-500" />
    }
    return <Play className="h-4 w-4 text-green-500" />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Notification Rules</h2>
          <p className="text-muted-foreground">
            Automate your notifications with intelligent rules
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => setShowAnalyticsDialog(true)}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Rule
          </Button>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-4">
        {rules.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-center space-y-4">
                <div className="mx-auto bg-muted rounded-full p-4 w-fit">
                  <Zap className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-medium">No automation rules yet</h3>
                  <p className="text-muted-foreground">
                    Create your first rule to automate notifications
                  </p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Rule
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center space-x-2">
                      {getRuleStatusIcon(rule)}
                      <h3 className="font-medium">{rule.name}</h3>
                      <Badge variant={rule.enabled ? 'default' : 'secondary'}>
                        {rule.enabled ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{rule.description}</p>
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span>Trigger: {getTriggerDescription(rule.trigger)}</span>
                      <span>Actions: {rule.actions.length}</span>
                      {rule.escalation && rule.escalation.length > 0 && (
                        <span>Escalation: {rule.escalation.length} steps</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {rule.actions.map((action, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {getActionDescription(action)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => duplicateRule(rule)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create Rule Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Notification Rule</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="trigger">Trigger</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              {/* Templates */}
              {templates.length > 0 && (
                <div className="space-y-2">
                  <Label>Start from Template</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {templates.map((template, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        className="justify-start h-auto p-3"
                        onClick={() => applyTemplate(template)}
                      >
                        <div className="text-left">
                          <div className="font-medium">{template.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {template.description}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input
                  value={newRule.name}
                  onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter rule name"
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={newRule.description}
                  onChange={(e) => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this rule does"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={newRule.enabled}
                  onCheckedChange={(checked) => setNewRule(prev => ({ ...prev, enabled: checked }))}
                />
                <Label>Enable rule immediately</Label>
              </div>
            </TabsContent>

            <TabsContent value="trigger" className="space-y-4">
              <div className="space-y-2">
                <Label>Trigger Type</Label>
                <Select
                  value={newRule.trigger.type}
                  onValueChange={(value) => setNewRule(prev => ({
                    ...prev,
                    trigger: { ...prev.trigger, type: value }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="time">Time</SelectItem>
                    <SelectItem value="condition">Condition</SelectItem>
                    <SelectItem value="user_action">User Action</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newRule.trigger.type === 'event' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Entity Type</Label>
                    <Select
                      value={newRule.trigger.event?.entityType}
                      onValueChange={(value) => setNewRule(prev => ({
                        ...prev,
                        trigger: {
                          ...prev.trigger,
                          event: { ...prev.trigger.event, entityType: value }
                        }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="task">Task</SelectItem>
                        <SelectItem value="project">Project</SelectItem>
                        <SelectItem value="calendar_event">Calendar Event</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Action</Label>
                    <Select
                      value={newRule.trigger.event?.action}
                      onValueChange={(value) => setNewRule(prev => ({
                        ...prev,
                        trigger: {
                          ...prev.trigger,
                          event: { ...prev.trigger.event, action: value }
                        }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created">Created</SelectItem>
                        <SelectItem value="updated">Updated</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="deleted">Deleted</SelectItem>
                        <SelectItem value="due_soon">Due Soon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {newRule.trigger.type === 'time' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Schedule (Cron)</Label>
                    <Input
                      value={newRule.trigger.time?.schedule || ''}
                      onChange={(e) => setNewRule(prev => ({
                        ...prev,
                        trigger: {
                          ...prev.trigger,
                          time: { ...prev.trigger.time, schedule: e.target.value }
                        }
                      }))}
                      placeholder="0 9 * * *"
                    />
                    <p className="text-xs text-muted-foreground">
                      Example: "0 9 * * *" for daily at 9 AM
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Input
                      value={newRule.trigger.time?.timezone || 'UTC'}
                      onChange={(e) => setNewRule(prev => ({
                        ...prev,
                        trigger: {
                          ...prev.trigger,
                          time: { ...prev.trigger.time, timezone: e.target.value }
                        }
                      }))}
                      placeholder="UTC"
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="actions" className="space-y-4">
              <div className="space-y-4">
                {newRule.actions.map((action, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <CardTitle className="text-sm">Action {index + 1}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Action Type</Label>
                        <Select
                          value={action.type}
                          onValueChange={(value) => {
                            const updatedActions = [...newRule.actions]
                            updatedActions[index] = { ...action, type: value }
                            setNewRule(prev => ({ ...prev, actions: updatedActions }))
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="send_notification">Send Notification</SelectItem>
                            <SelectItem value="send_email">Send Email</SelectItem>
                            <SelectItem value="send_sms">Send SMS</SelectItem>
                            <SelectItem value="create_task">Create Task</SelectItem>
                            <SelectItem value="update_status">Update Status</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Title</Label>
                          <Input
                            value={action.config.title || ''}
                            onChange={(e) => {
                              const updatedActions = [...newRule.actions]
                              updatedActions[index] = {
                                ...action,
                                config: { ...action.config, title: e.target.value }
                              }
                              setNewRule(prev => ({ ...prev, actions: updatedActions }))
                            }}
                            placeholder="Notification title"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Priority</Label>
                          <Select
                            value={action.config.priority || 'medium'}
                            onValueChange={(value) => {
                              const updatedActions = [...newRule.actions]
                              updatedActions[index] = {
                                ...action,
                                config: { ...action.config, priority: value }
                              }
                              setNewRule(prev => ({ ...prev, actions: updatedActions }))
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Message</Label>
                        <Textarea
                          value={action.config.message || ''}
                          onChange={(e) => {
                            const updatedActions = [...newRule.actions]
                            updatedActions[index] = {
                              ...action,
                              config: { ...action.config, message: e.target.value }
                            }
                            setNewRule(prev => ({ ...prev, actions: updatedActions }))
                          }}
                          placeholder="Use {{field}} for dynamic values"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Button
                  variant="outline"
                  onClick={() => {
                    setNewRule(prev => ({
                      ...prev,
                      actions: [...prev.actions, {
                        type: 'send_notification',
                        config: {
                          title: '',
                          message: '',
                          priority: 'medium',
                          category: 'system'
                        }
                      }]
                    }))
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Action
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Escalation Rules</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Define what happens if the initial notification is not acknowledged
                  </p>
                  {/* Escalation rules would be implemented here */}
                </div>

                <div>
                  <h4 className="font-medium mb-2">Filters</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add conditions to filter when this rule should execute
                  </p>
                  {/* Filters would be implemented here */}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => {
              setShowCreateDialog(false)
              resetNewRule()
            }}>
              Cancel
            </Button>
            <Button onClick={createRule}>
              Create Rule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Analytics Dialog */}
      <Dialog open={showAnalyticsDialog} onOpenChange={setShowAnalyticsDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Rule Analytics</DialogTitle>
          </DialogHeader>
          {analytics && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Rules</p>
                        <p className="text-2xl font-bold">{analytics.totalRules}</p>
                      </div>
                      <Settings className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Active Rules</p>
                        <p className="text-2xl font-bold">{analytics.activeRules}</p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-green-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Execution Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Total Executions</span>
                      <span>{analytics.executionStats.totalExecutions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Successful</span>
                      <span className="text-green-600">{analytics.executionStats.successfulExecutions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Failed</span>
                      <span className="text-red-600">{analytics.executionStats.failedExecutions}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}