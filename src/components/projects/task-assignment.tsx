'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { useEmailNotifications } from '@/hooks/use-email-notifications'
import {
  UserPlus,
  Users,
  Clock,
  Calendar as CalendarIcon,
  Check,
  ChevronsUpDown,
  X,
  AlertCircle,
  CheckCircle,
  Mail,
  Bell,
  Settings
} from 'lucide-react'
import { format } from 'date-fns'

interface TaskAssignmentProps {
  taskId: string
  taskTitle: string
  currentAssignees?: User[]
  projectId: string
  className?: string
  onAssignmentChange?: (assignees: User[]) => void
}

interface User {
  id: string
  name?: string
  email: string
  avatar?: string
  role?: string
  isOnline?: boolean
  lastActive?: Date
}

interface Assignment {
  id: string
  taskId: string
  userId: string
  assignedBy: string
  assignedAt: Date
  dueDate?: Date
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'COMPLETED'
  estimatedHours?: number
  actualHours?: number
  notes?: string
  user: User
  assignedByUser: User
}

export function TaskAssignment({ 
  taskId, 
  taskTitle, 
  currentAssignees = [], 
  projectId, 
  className,
  onAssignmentChange 
}: TaskAssignmentProps) {
  const { data: session } = useSession()
  const { toast } = useToast()
  const { sendTaskAssignmentEmail, isSending: isSendingEmail } = useEmailNotifications()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<User[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selectedUsers, setSelectedUsers] = useState<User[]>(currentAssignees)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [assignmentDetails, setAssignmentDetails] = useState({
    dueDate: undefined as Date | undefined,
    priority: 'MEDIUM' as Assignment['priority'],
    estimatedHours: '',
    notes: '',
    sendNotification: true
  })

  useEffect(() => {
    if (open) {
      fetchAvailableUsers()
      fetchAssignments()
    }
  }, [open, projectId, taskId])

  useEffect(() => {
    setSelectedUsers(currentAssignees)
  }, [currentAssignees])

  const fetchAvailableUsers = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/members`)
      if (response.ok) {
        const users = await response.json()
        setAvailableUsers(users)
      }
    } catch (error) {
      console.error('Failed to fetch available users:', error)
    }
  }

  const fetchAssignments = async () => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/assignments`)
      if (response.ok) {
        const data = await response.json()
        setAssignments(data)
      }
    } catch (error) {
      console.error('Failed to fetch assignments:', error)
    }
  }

  const assignUsers = async () => {
    if (selectedUsers.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one user to assign',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)
    try {
      const assignmentData = {
        userIds: selectedUsers.map(user => user.id),
        dueDate: assignmentDetails.dueDate,
        priority: assignmentDetails.priority,
        estimatedHours: assignmentDetails.estimatedHours ? parseInt(assignmentDetails.estimatedHours) : undefined,
        notes: assignmentDetails.notes
      }

      const response = await fetch(`/api/tasks/${taskId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignmentData)
      })

      if (response.ok) {
        const newAssignments = await response.json()
        setAssignments(prev => [...prev, ...newAssignments])
        
        // Send email notifications if enabled
        if (assignmentDetails.sendNotification && session?.user) {
          for (const user of selectedUsers) {
            try {
              await sendTaskAssignmentEmail(
                user.email,
                {
                  userName: user.name || user.email,
                  taskTitle,
                  projectName: 'Current Project', // You might want to pass this as a prop
                  assignedBy: session.user.name || session.user.email || 'Unknown',
                  taskUrl: `${window.location.origin}/tasks/${taskId}`,
                  taskId,
                  dueDate: assignmentDetails.dueDate ? format(assignmentDetails.dueDate, 'PPP') : undefined
                }
              )
            } catch (emailError) {
              console.error('Failed to send assignment email to', user.email, emailError)
              // Don't fail the assignment if email fails
            }
          }
        }
        
        // Update parent component
        if (onAssignmentChange) {
          onAssignmentChange(selectedUsers)
        }

        // Reset form
        setSelectedUsers([])
        setAssignmentDetails({
          dueDate: undefined,
          priority: 'MEDIUM',
          estimatedHours: '',
          notes: '',
          sendNotification: true
        })

        toast({
          title: 'Success',
          description: `Task assigned to ${selectedUsers.length} user(s)${
            assignmentDetails.sendNotification ? ' with email notifications' : ''
          }`
        })
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.message || 'Failed to assign task',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to assign task',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const updateAssignmentStatus = async (assignmentId: string, status: Assignment['status']) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })

      if (response.ok) {
        setAssignments(prev => prev.map(assignment => 
          assignment.id === assignmentId 
            ? { ...assignment, status }
            : assignment
        ))
        toast({
          title: 'Success',
          description: 'Assignment status updated'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update assignment status',
        variant: 'destructive'
      })
    }
  }

  const removeAssignment = async (assignmentId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/assignments/${assignmentId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setAssignments(prev => prev.filter(assignment => assignment.id !== assignmentId))
        toast({
          title: 'Success',
          description: 'Assignment removed'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove assignment',
        variant: 'destructive'
      })
    }
  }

  const getStatusColor = (status: Assignment['status']) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800'
      case 'ACCEPTED': return 'bg-blue-100 text-blue-800'
      case 'DECLINED': return 'bg-red-100 text-red-800'
      case 'COMPLETED': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: Assignment['status']) => {
    switch (status) {
      case 'PENDING': return <Clock className="h-3 w-3" />
      case 'ACCEPTED': return <CheckCircle className="h-3 w-3" />
      case 'DECLINED': return <X className="h-3 w-3" />
      case 'COMPLETED': return <Check className="h-3 w-3" />
      default: return <AlertCircle className="h-3 w-3" />
    }
  }

  const getPriorityColor = (priority: Assignment['priority']) => {
    switch (priority) {
      case 'LOW': return 'bg-green-100 text-green-800'
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800'
      case 'HIGH': return 'bg-orange-100 text-orange-800'
      case 'CRITICAL': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <UserPlus className="h-4 w-4 mr-2" />
          Assign Task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Assign "{taskTitle}"
          </DialogTitle>
          <DialogDescription>
            Assign this task to team members and set assignment details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* User Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Select Assignees
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={searchOpen}
                    className="w-full justify-between"
                  >
                    {selectedUsers.length > 0
                      ? `${selectedUsers.length} user(s) selected`
                      : "Select users..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search users..." />
                    <CommandEmpty>No users found.</CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {availableUsers.map((user) => {
                          const isSelected = selectedUsers.some(selected => selected.id === user.id)
                          return (
                            <CommandItem
                              key={user.id}
                              onSelect={() => {
                                if (isSelected) {
                                  setSelectedUsers(prev => prev.filter(u => u.id !== user.id))
                                } else {
                                  setSelectedUsers(prev => [...prev, user])
                                }
                              }}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={user.avatar} />
                                  <AvatarFallback>
                                    {user.name?.[0] || user.email[0].toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-medium text-sm">
                                    {user.name || 'Unknown User'}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {user.email}
                                  </div>
                                </div>
                                {user.isOnline && (
                                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                                )}
                              </div>
                              <Check
                                className={`ml-auto h-4 w-4 ${
                                  isSelected ? "opacity-100" : "opacity-0"
                                }`}
                              />
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Selected Users */}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((user) => (
                    <Badge
                      key={user.id}
                      variant="secondary"
                      className="flex items-center gap-1 pl-1"
                    >
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback className="text-xs">
                          {user.name?.[0] || user.email[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {user.name || user.email}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => setSelectedUsers(prev => prev.filter(u => u.id !== user.id))}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assignment Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Assignment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {assignmentDetails.dueDate 
                          ? format(assignmentDetails.dueDate, "PPP")
                          : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={assignmentDetails.dueDate}
                        onSelect={(date) => setAssignmentDetails(prev => ({ ...prev, dueDate: date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select 
                    value={assignmentDetails.priority} 
                    onValueChange={(value) => setAssignmentDetails(prev => ({ ...prev, priority: value as Assignment['priority'] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="estimatedHours">Estimated Hours</Label>
                <Input
                  id="estimatedHours"
                  type="number"
                  placeholder="Enter estimated hours"
                  value={assignmentDetails.estimatedHours}
                  onChange={(e) => setAssignmentDetails(prev => ({ ...prev, estimatedHours: e.target.value }))}
                />
              </div>
              
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes for the assignees..."
                  value={assignmentDetails.notes}
                  onChange={(e) => setAssignmentDetails(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              
              {/* Email Notification Toggle */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sendNotification"
                  checked={assignmentDetails.sendNotification}
                  onCheckedChange={(checked) => setAssignmentDetails(prev => ({ ...prev, sendNotification: !!checked }))}
                />
                <Label htmlFor="sendNotification" className="flex items-center gap-2 cursor-pointer">
                  <Mail className="h-4 w-4" />
                  Send email notifications to assignees
                </Label>
              </div>
              
              <Button 
                onClick={assignUsers} 
                disabled={loading || selectedUsers.length === 0 || isSendingEmail}
                className="w-full"
              >
                {loading || isSendingEmail ? 'Assigning...' : 'Assign Task'}
              </Button>
            </CardContent>
          </Card>

          {/* Current Assignments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Current Assignments ({assignments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-60">
                <div className="space-y-3">
                  {assignments.map((assignment) => (
                    <motion.div
                      key={assignment.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={assignment.user.avatar} />
                          <AvatarFallback>
                            {assignment.user.name?.[0] || assignment.user.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {assignment.user.name || 'Unknown User'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {assignment.user.email}
                          </div>
                          {assignment.dueDate && (
                            <div className="text-xs text-muted-foreground">
                              Due: {format(new Date(assignment.dueDate), 'PPP')}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getPriorityColor(assignment.priority)}>
                          {assignment.priority}
                        </Badge>
                        <Badge className={getStatusColor(assignment.status)}>
                          {getStatusIcon(assignment.status)}
                          {assignment.status}
                        </Badge>
                        {assignment.status === 'PENDING' && assignment.userId === session?.user?.id && (
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateAssignmentStatus(assignment.id, 'ACCEPTED')}
                            >
                              Accept
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateAssignmentStatus(assignment.id, 'DECLINED')}
                            >
                              Decline
                            </Button>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeAssignment(assignment.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                  {assignments.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      No assignments yet
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}