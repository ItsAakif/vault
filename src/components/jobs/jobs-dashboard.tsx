'use client'

import { useState, useEffect } from 'react'
import { Priority } from '@/lib/db'
import type { JobData } from '@/lib/google-drive-jobs-adapter'
import { JobStageId, JOB_STAGE_PROGRESS, JOB_STAGES, getJobStage } from '@/lib/job-stages'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { 
  Plus, 
  Briefcase, 
  MapPin, 
  DollarSign, 
  Calendar, 
  ExternalLink,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Users,
  Building,
  Search,
  Filter
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { DriveRequiredNotice } from '@/components/drive/drive-required-notice'
import { parseDriveFailure, type DriveFailure } from '@/lib/drive-client'

/**
 * UI shape for a job opportunity as returned by the Drive-backed jobs API.
 * The API returns `JobData`; the dashboard renders a richer pipeline stage and
 * a few renamed fields, so we map at the boundary instead of widening to `any`.
 */
interface JobListItem {
  id: string
  title: string
  company: string
  description: string
  location: string
  salary: string
  applicationUrl: string
  deadline: Date | null
  stage: JobStageId
  priority: Priority
  notes: string
}

/**
 * The jobs API's `status` is already a `JobStageId` (`APPLIED`, `OFFER_RECEIVED`, ...): the create
 * form posts a stage id and the Drive adapter persists it verbatim. Older records instead carry a
 * lowercase word (`applied`, `offered`, ...). Both are resolved here, case-insensitively, because a
 * lookup that only knew the lowercase words mapped every current record to `INTERESTED`.
 */
const LEGACY_JOB_STATUS_TO_STAGE: Record<string, JobStageId> = {
  APPLIED: 'APPLIED',
  INTERVIEW: 'INTERVIEWING',
  OFFERED: 'OFFER_RECEIVED',
  ACCEPTED: 'OFFER_ACCEPTED',
  DECLINED: 'OFFER_DECLINED',
  REJECTED: 'REJECTED'
}

function isJobStageId(value: string): value is JobStageId {
  return JOB_STAGES.some((stage) => stage.id === value)
}

/**
 * Resolve a persisted `status` value to a pipeline stage. A stage id wins (that is what the API
 * returns today); the legacy lowercase vocabulary is the fallback; anything else - a missing value,
 * a word from neither vocabulary - degrades to `INTERESTED` rather than dropping the record.
 */
export function resolveJobStage(status: unknown): JobStageId {
  if (typeof status !== 'string') return 'INTERESTED'
  const normalized = status.trim().toUpperCase()
  if (isJobStageId(normalized)) return normalized
  return LEGACY_JOB_STATUS_TO_STAGE[normalized] ?? 'INTERESTED'
}

function mapJobData(raw: JobData): JobListItem {
  return {
    id: raw.id,
    title: raw.title,
    company: raw.company,
    description: raw.description ?? '',
    location: raw.location ?? '',
    salary: raw.salary ?? '',
    applicationUrl: raw.url ?? '',
    deadline: raw.dateDeadline ? new Date(raw.dateDeadline) : null,
    stage: resolveJobStage(raw.status),
    priority: 'MEDIUM',
    notes: raw.notes ?? ''
  }
}

interface JobsDashboardProps {
  className?: string
}

export function JobsDashboard({ className }: JobsDashboardProps) {
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [loading, setLoading] = useState(true)
  // ADR-008 D5: set only when the jobs API answers with a Drive code, so the empty list below is
  // replaced by the connect CTA instead of reading as "you have no jobs".
  const [driveFailure, setDriveFailure] = useState<DriveFailure | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [filterStage, setFilterStage] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [newJob, setNewJob] = useState({
    title: '',
    company: '',
    description: '',
    location: '',
    salary: '',
    applicationUrl: '',
    applicationDate: new Date(),
    deadline: new Date(),
    stage: 'INTERESTED' as JobStageId,
    priority: 'MEDIUM' as Priority,
    notes: ''
  })
  const { toast } = useToast()

  useEffect(() => {
    fetchJobs()
  }, [])

  const fetchJobs = async () => {
    setLoading(true)
    // A refetch clears a previous Drive failure: leaving it set after a successful fetch would
    // tell the user Drive is disconnected while they are looking at their jobs.
    setDriveFailure(null)
    try {
      const response = await fetch('/api/jobs')
      if (response.ok) {
        const data = await response.json()
        setJobs(Array.isArray(data) ? data.map((job: JobData) => mapJobData(job)) : [])
      } else {
        // ADR-008 D5: a Drive code explains the (otherwise empty) list. parseDriveFailure returns
        // null for a generic 500, which keeps the previous behaviour for non-Drive failures.
        setDriveFailure(parseDriveFailure(await response.json().catch(() => null)))
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch job opportunities',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateJob = async () => {
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newJob)
      })

      if (response.ok) {
        const createdJob = await response.json()
        setJobs(prev => [mapJobData(createdJob as JobData), ...prev])
        setShowCreateDialog(false)
        setNewJob({
          title: '',
          company: '',
          description: '',
          location: '',
          salary: '',
          applicationUrl: '',
          applicationDate: new Date(),
          deadline: new Date(),
          stage: 'INTERESTED',
          priority: 'MEDIUM',
          notes: ''
        })
        toast({
          title: 'Success',
          description: 'Job opportunity created successfully'
        })
      } else {
        // A failed create against a disconnected Drive must be explained, not silently dropped.
        setDriveFailure(parseDriveFailure(await response.json().catch(() => null)))
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create job opportunity',
        variant: 'destructive'
      })
    }
  }

  // `getStageColor` reads the lib-owned `colorClass` (src/lib/job-stages.ts), which is the ADR-011
  // semantic token vocabulary imported from `job-stage-tones.ts` (T081). Kept as a single lookup so
  // there is no second colour definition in this component.
  const getStageColor = (stage: JobStageId) => getJobStage(stage).colorClass

  // ADR-011 D1: one priority scale in the semantic tokens, not raw palette literals. The `bg-*/10`
  // and `bg-*/20` tints are real only because the tokens are channel-wrapped (ADR-011 D1-A / T077).
  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'LOW': return 'bg-positive/10 text-positive'
      case 'MEDIUM': return 'bg-caution/10 text-caution'
      case 'HIGH': return 'bg-danger/10 text-danger'
      case 'CRITICAL': return 'bg-danger/20 text-danger'
      default: return 'bg-surface-sunken text-ink-muted'
    }
  }

  const getStageIcon = (stage: JobStageId) => {
    switch (stage) {
      case 'INTERESTED': return <Search className="h-4 w-4" />
      case 'APPLIED': return <Clock className="h-4 w-4" />
      case 'INTERVIEWING': return <Users className="h-4 w-4" />
      case 'OFFER_RECEIVED': return <CheckCircle className="h-4 w-4" />
      case 'OFFER_ACCEPTED': return <CheckCircle className="h-4 w-4" />
      case 'OFFER_DECLINED': return <XCircle className="h-4 w-4" />
      case 'REJECTED': return <XCircle className="h-4 w-4" />
      case 'WITHDRAWN': return <AlertTriangle className="h-4 w-4" />
      default: return <Briefcase className="h-4 w-4" />
    }
  }

  const filteredJobs = jobs.filter(job => {
    const matchesStage = filterStage === 'all' || job.stage === filterStage
    const matchesSearch = searchQuery === '' || 
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStage && matchesSearch
  })

  // "No roles yet" and "nothing matched this filter" are different situations, so they get
  // different copy and different actions. The filtered state names the filter it did not match.
  const activeStageLabel =
    filterStage === 'all'
      ? null
      : JOB_STAGES.find((stage) => stage.id === filterStage)?.label ?? filterStage.replace(/_/g, ' ')

  const describeActiveFilter = () => {
    if (searchQuery && activeStageLabel) return `No role matches '${searchQuery}' in ${activeStageLabel}.`
    if (searchQuery) return `No role matches '${searchQuery}'.`
    if (activeStageLabel) return `No role is in ${activeStageLabel}.`
    return 'No role matches the current filter.'
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilterStage('all')
  }

  const jobStats = {
    total: jobs.length,
    interested: jobs.filter(j => j.stage === 'INTERESTED').length,
    applied: jobs.filter(j => j.stage === 'APPLIED').length,
    interviewing: jobs.filter(j => j.stage === 'INTERVIEWING').length,
    offers: jobs.filter(j => j.stage === 'OFFER_RECEIVED' || j.stage === 'OFFER_ACCEPTED').length,
    rejected: jobs.filter(j => j.stage === 'REJECTED').length
  }

  const stageProgress = JOB_STAGE_PROGRESS

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
          <h1 className="text-3xl font-bold">Jobs & Opportunities</h1>
          <p className="text-muted-foreground">Track your job applications and opportunities</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Opportunity
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add New Job Opportunity</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label htmlFor="job-title" className="text-sm font-medium">
                    Job Title
                  </label>
                  <Input
                    id="job-title"
                    value={newJob.title}
                    onChange={(e) => setNewJob(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter job title"
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="company" className="text-sm font-medium">
                    Company
                  </label>
                  <Input
                    id="company"
                    value={newJob.company}
                    onChange={(e) => setNewJob(prev => ({ ...prev, company: e.target.value }))}
                    placeholder="Enter company name"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <label htmlFor="description" className="text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="description"
                  value={newJob.description}
                  onChange={(e) => setNewJob(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter job description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label htmlFor="location" className="text-sm font-medium">
                    Location
                  </label>
                  <Input
                    id="location"
                    value={newJob.location}
                    onChange={(e) => setNewJob(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="Enter location"
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="salary" className="text-sm font-medium">
                    Salary
                  </label>
                  <Input
                    id="salary"
                    value={newJob.salary}
                    onChange={(e) => setNewJob(prev => ({ ...prev, salary: e.target.value }))}
                    placeholder="Enter salary range"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label htmlFor="application-url" className="text-sm font-medium">
                    Application URL
                  </label>
                  <Input
                    id="application-url"
                    value={newJob.applicationUrl}
                    onChange={(e) => setNewJob(prev => ({ ...prev, applicationUrl: e.target.value }))}
                    placeholder="Enter application URL"
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="deadline" className="text-sm font-medium">
                    Application Deadline
                  </label>
                  <Input
                    type="date"
                    value={newJob.deadline.toISOString().split('T')[0]}
                    onChange={(e) => setNewJob(prev => ({ ...prev, deadline: new Date(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Application Stage</label>
                  <Select 
                    value={newJob.stage} 
                    onValueChange={(value: JobStageId) => setNewJob(prev => ({ ...prev, stage: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INTERESTED">Interested</SelectItem>
                      <SelectItem value="APPLIED">Applied</SelectItem>
                      <SelectItem value="INTERVIEWING">Interviewing</SelectItem>
                      <SelectItem value="OFFER_RECEIVED">Offer Received</SelectItem>
                      <SelectItem value="OFFER_ACCEPTED">Offer Accepted</SelectItem>
                      <SelectItem value="OFFER_DECLINED">Offer Declined</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                      <SelectItem value="WITHDRAWN">Withdrawn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Priority</label>
                  <Select 
                    value={newJob.priority} 
                    onValueChange={(value: Priority) => setNewJob(prev => ({ ...prev, priority: value }))}
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
              <div className="grid gap-2">
                <label htmlFor="notes" className="text-sm font-medium">
                  Notes
                </label>
                <Textarea
                  id="notes"
                  value={newJob.notes}
                  onChange={(e) => setNewJob(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Enter any additional notes"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateJob}>
                Add Opportunity
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobStats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Interested</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobStats.interested}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applied</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobStats.applied}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Interviewing</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobStats.interviewing}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offers</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobStats.offers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobStats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex space-x-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="INTERESTED">Interested</SelectItem>
            <SelectItem value="APPLIED">Applied</SelectItem>
            <SelectItem value="INTERVIEWING">Interviewing</SelectItem>
            <SelectItem value="OFFER_RECEIVED">Offer Received</SelectItem>
            <SelectItem value="OFFER_ACCEPTED">Offer Accepted</SelectItem>
            <SelectItem value="OFFER_DECLINED">Offer Declined</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="WITHDRAWN">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Jobs List */}
      <div className="grid gap-4">
        {filteredJobs.map((job) => (
          <Card key={job.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <CardTitle className="text-lg">{job.title}</CardTitle>
                    <Badge className={getPriorityColor(job.priority)}>
                      {job.priority}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-2 text-muted-foreground">
                    <Building className="h-4 w-4" />
                    <span>{job.company}</span>
                    {job.location && (
                      <>
                        <MapPin className="h-4 w-4 ml-2" />
                        <span>{job.location}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className={getStageColor(job.stage)}>
                    {getStageIcon(job.stage)}
                    <span className="ml-1">{getJobStage(job.stage).label}</span>
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {job.description && (
                  <p className="text-sm text-muted-foreground">{job.description}</p>
                )}
                
                <div className="flex justify-between items-center">
                  <div className="flex space-x-4 text-sm text-muted-foreground">
                    {job.salary && (
                      <div className="flex items-center space-x-1">
                        <DollarSign className="h-4 w-4" />
                        <span>{job.salary}</span>
                      </div>
                    )}
                    {job.deadline && (
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>Deadline: {new Date(job.deadline).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                  {job.applicationUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Apply
                      </a>
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Application Progress</span>
                    <span>{stageProgress[job.stage]}%</span>
                  </div>
                  <Progress value={stageProgress[job.stage]} className="h-2" />
                </div>

                {job.notes && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm">{job.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ADR-008 D5 composed inside the shared error vocabulary (ADR-011 D3): the notice *is* the
          error state's content, and no retry sits beside the connect CTA. */}
      {filteredJobs.length === 0 && driveFailure && (
        <ErrorState>
          <DriveRequiredNotice message={driveFailure.message} />
        </ErrorState>
      )}

      {filteredJobs.length === 0 && !driveFailure && (
        jobs.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No roles tracked yet"
            description="Add a role you have applied to and track it from application to offer."
            action={{ label: 'Add a role', onClick: () => setShowCreateDialog(true) }}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No roles match that filter"
            description={describeActiveFilter()}
            action={{ label: 'Clear filter', onClick: clearFilters }}
          />
        )
      )}
    </div>
  )
}