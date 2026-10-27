'use client'

import { useState, useEffect } from 'react'
import { Project, Task, Milestone, ProjectStatus, Priority, TaskStatus } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { 
  Plus, 
  Calendar as CalendarIcon, 
  Target, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  MoreHorizontal,
  Edit,
  Trash2,
  Users,
  BarChart3,
  FolderKanban
} from 'lucide-react'
import { useAppStore } from '@/store'
import { useToast } from '@/hooks/use-toast'
import { DriveRequiredNotice } from '@/components/drive/drive-required-notice'
import { parseDriveFailure, type DriveFailure } from '@/lib/drive-client'

/**
 * The projects API returns each project with its `tasks`/`milestones`
 * relations attached. The base `Project` type does not declare them, so we
 * model the list item locally rather than widening to `any`.
 */
interface ProjectListItem extends Project {
  tasks?: Array<{ id: string }>
  milestones?: Array<{ id: string }>
}

interface ProjectDashboardProps {
  className?: string
}

/**
 * `/api/projects` is the only content route that answers with an envelope
 * (`{ success: true, data: [...] }`); `/api/jobs`, `/api/tags` and `/api/content` answer with a
 * bare array. Both shapes are unwrapped here, once, at the parse site, so no `.filter`/`.map`
 * below can ever receive the envelope object - which is what used to reach
 * `projects.filter(...)` and throw `A.filter is not a function`.
 *
 * Anything else (`null`, a string, `{}`) normalises to `[]`. That is deliberate: the surface
 * already has an empty state for a list it cannot read, and a malformed body must never become a
 * rendered row. The route's contract is untouched - the mobile client may rely on the envelope.
 */
interface DataEnvelope {
  data: unknown
}

function isDataEnvelope(body: unknown): body is DataEnvelope {
  return typeof body === 'object' && body !== null && 'data' in body
}

/**
 * The fields the cards and the stats actually read. A body can be an array of the wrong things, and
 * `project.status.replace(...)` in the render would throw on those, so elements are checked rather
 * than trusted.
 */
function isProjectListItem(value: unknown): value is ProjectListItem {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { id?: unknown; title?: unknown; status?: unknown; priority?: unknown }
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.priority === 'string'
  )
}

function readProjectList(body: unknown): ProjectListItem[] {
  const payload = isDataEnvelope(body) ? body.data : body
  return Array.isArray(payload) ? payload.filter(isProjectListItem) : []
}

/** The create path's counterpart: one project, bare or inside the envelope, or nothing. */
function readProjectItem(body: unknown): ProjectListItem | null {
  const payload = isDataEnvelope(body) ? body.data : body
  return isProjectListItem(payload) ? payload : null
}

export function ProjectDashboard({ className }: ProjectDashboardProps) {
  const { currentProject, setCurrentProject } = useAppStore()
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  // ADR-008 D5: set only for a Drive-code failure, so the empty list is replaced by the connect
  // CTA rather than reading as "you have no projects".
  const [driveFailure, setDriveFailure] = useState<DriveFailure | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showProjectDetail, setShowProjectDetail] = useState(false)
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    startDate: new Date(),
    endDate: new Date(),
    priority: 'MEDIUM' as Priority
  })
  const { toast } = useToast()

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    setLoading(true)
    // A refetch clears a previous Drive failure: a stale notice after a successful fetch would
    // claim Drive is disconnected while the user is looking at their projects.
    setDriveFailure(null)
    try {
      const response = await fetch('/api/projects')
      if (response.ok) {
        const data = await response.json()
        // Envelope or bare array; anything else is an empty list, never a non-array in state.
        setProjects(readProjectList(data))
      } else {
        // ADR-008 D5: the projects routes answer 403 DRIVE_NOT_CONNECTED / DRIVE_GRANT_INVALID
        // (T050), so this matches; a generic 500 parses to null and keeps the old behaviour.
        setDriveFailure(parseDriveFailure(await response.json().catch(() => null)))
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch projects',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async () => {
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newProject)
      })

      if (response.ok) {
        // The POST answers `{ success: true, data: project }` - the same envelope as the GET. The
        // row prepended below must be the project itself, not the envelope that carries it.
        const createdProject = readProjectItem(await response.json())
        if (createdProject) {
          setProjects(prev => [createdProject, ...prev])
        }
        setShowCreateDialog(false)
        setNewProject({
          title: '',
          description: '',
          startDate: new Date(),
          endDate: new Date(),
          priority: 'MEDIUM'
        })
        toast({
          title: 'Success',
          description: 'Project created successfully'
        })
      } else {
        // A failed create against a disconnected Drive must be explained, not silently dropped.
        setDriveFailure(parseDriveFailure(await response.json().catch(() => null)))
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create project',
        variant: 'destructive'
      })
    }
  }

  // ADR-011 D1: one status scale and one priority scale, expressed in the semantic tokens rather
  // than raw Tailwind palette literals. `bg-*/10` and `bg-*/20` are real only because the colour
  // tokens are channel-wrapped (ADR-011 D1-A / T077); before that they emitted no rule at all.
  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'PLANNING': return 'bg-signal/10 text-signal'
      case 'ACTIVE': return 'bg-caution/10 text-caution'
      case 'COMPLETED': return 'bg-positive/10 text-positive'
      case 'ON_HOLD': return 'bg-danger/10 text-danger'
      case 'CANCELLED': return 'bg-surface-sunken text-ink-muted'
      default: return 'bg-surface-sunken text-ink-muted'
    }
  }

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'LOW': return 'bg-positive/10 text-positive'
      case 'MEDIUM': return 'bg-caution/10 text-caution'
      case 'HIGH': return 'bg-danger/10 text-danger'
      case 'CRITICAL': return 'bg-danger/20 text-danger'
      default: return 'bg-surface-sunken text-ink-muted'
    }
  }

  const projectStats = {
    total: projects.length,
    inProgress: projects.filter(p => p.status === 'ACTIVE').length,
    completed: projects.filter(p => p.status === 'COMPLETED').length,
    onHold: projects.filter(p => p.status === 'ON_HOLD').length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground">Manage your projects and track progress</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="title" className="text-sm font-medium">
                  Title
                </label>
                <Input
                  id="title"
                  value={newProject.title}
                  onChange={(e) => setNewProject(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter project title"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="description" className="text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="description"
                  value={newProject.description}
                  onChange={(e) => setNewProject(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter project description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Start Date</label>
                  <Input
                    type="date"
                    value={newProject.startDate.toISOString().split('T')[0]}
                    onChange={(e) => setNewProject(prev => ({ ...prev, startDate: new Date(e.target.value) }))}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">End Date</label>
                  <Input
                    type="date"
                    value={newProject.endDate.toISOString().split('T')[0]}
                    onChange={(e) => setNewProject(prev => ({ ...prev, endDate: new Date(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Priority</label>
                <Select 
                  value={newProject.priority} 
                  onValueChange={(value: Priority) => setNewProject(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateProject}>
                Create Project
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectStats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectStats.inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectStats.completed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Hold</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectStats.onHold}</div>
          </CardContent>
        </Card>
      </div>

      {/* Projects List */}
      <div className="grid gap-4">
        {projects.map((project) => (
          <Card key={project.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <CardTitle className="text-lg">{project.title}</CardTitle>
                  <div className="flex space-x-2">
                    <Badge className={getStatusColor(project.status)}>
                      {project.status.replace('_', ' ')}
                    </Badge>
                    <Badge className={getPriorityColor(project.priority)}>
                      {project.priority}
                    </Badge>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {project.description && (
                  <p className="text-sm text-muted-foreground">{project.description}</p>
                )}
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{project.progress}%</span>
                  </div>
                  <Progress value={project.progress} className="h-2" />
                </div>

                <div className="flex justify-between text-sm text-muted-foreground">
                  <div className="flex items-center space-x-1">
                    <CalendarIcon className="h-4 w-4" />
                    <span>
                      {project.startDate ? new Date(project.startDate).toLocaleDateString() : 'No start date'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Target className="h-4 w-4" />
                    <span>
                      {project.endDate ? new Date(project.endDate).toLocaleDateString() : 'No end date'}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex space-x-4 text-sm text-muted-foreground">
                    <span>{project.tasks?.length || 0} tasks</span>
                    <span>{project.milestones?.length || 0} milestones</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setCurrentProject(project)
                      setShowProjectDetail(true)
                    }}
                  >
                    View Details
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ADR-008 D5 composed inside the shared error vocabulary (ADR-011 D3): the Drive notice is
          the content of the error state, not a second competing banner, and no retry sits next to
          a connect CTA. The header, dialogs and stats above stay mounted. */}
      {projects.length === 0 && driveFailure && (
        <ErrorState>
          <DriveRequiredNotice message={driveFailure.message} />
        </ErrorState>
      )}

      {projects.length === 0 && !driveFailure && (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="A project groups the tasks, milestones and files for one piece of work."
          action={{ label: 'New project', onClick: () => setShowCreateDialog(true) }}
        />
      )}
    </div>
  )
}