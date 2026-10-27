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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import {
  Share2,
  Users,
  Mail,
  Copy,
  Settings,
  UserPlus,
  Eye,
  Edit,
  Trash2,
  Shield,
  Globe,
  Lock,
  Link2
} from 'lucide-react'

interface ProjectSharingProps {
  projectId: string
  projectTitle: string
  className?: string
}

interface Collaborator {
  id: string
  userId: string
  role: 'OWNER' | 'EDITOR' | 'VIEWER' | 'COMMENTER'
  user: {
    id: string
    name?: string
    email: string
    avatar?: string
  }
  addedAt: Date
}

interface ShareLink {
  id: string
  token: string
  permissions: 'VIEW' | 'COMMENT' | 'EDIT'
  expiresAt?: Date
  isActive: boolean
}

export function ProjectSharing({ projectId, projectTitle, className }: ProjectSharingProps) {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([])
  const [newCollaboratorEmail, setNewCollaboratorEmail] = useState('')
  const [newCollaboratorRole, setNewCollaboratorRole] = useState<'VIEWER' | 'COMMENTER' | 'EDITOR'>('VIEWER')
  const [showAdvancedSharing, setShowAdvancedSharing] = useState(false)

  useEffect(() => {
    if (open) {
      fetchCollaborators()
      fetchShareLinks()
    }
  }, [open, projectId])

  const fetchCollaborators = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/collaborators`)
      if (response.ok) {
        const data = await response.json()
        setCollaborators(data)
      }
    } catch (error) {
      console.error('Failed to fetch collaborators:', error)
    }
  }

  const fetchShareLinks = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/shares`)
      if (response.ok) {
        const data = await response.json()
        setShareLinks(data)
      }
    } catch (error) {
      console.error('Failed to fetch share links:', error)
    }
  }

  const addCollaborator = async () => {
    if (!newCollaboratorEmail || !newCollaboratorRole) return

    setLoading(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newCollaboratorEmail,
          role: newCollaboratorRole
        })
      })

      if (response.ok) {
        const newCollaborator = await response.json()
        setCollaborators(prev => [...prev, newCollaborator])
        setNewCollaboratorEmail('')
        setNewCollaboratorRole('VIEWER')
        toast({
          title: 'Success',
          description: 'Collaborator added successfully'
        })
      } else {
        const error = await response.json()
        toast({
          title: 'Error',
          description: error.message || 'Failed to add collaborator',
          variant: 'destructive'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add collaborator',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const updateCollaboratorRole = async (collaboratorId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/collaborators/${collaboratorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })

      if (response.ok) {
        setCollaborators(prev => prev.map(collab => 
          collab.id === collaboratorId 
            ? { ...collab, role: newRole as any }
            : collab
        ))
        toast({
          title: 'Success',
          description: 'Collaborator role updated'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update role',
        variant: 'destructive'
      })
    }
  }

  const removeCollaborator = async (collaboratorId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/collaborators/${collaboratorId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setCollaborators(prev => prev.filter(collab => collab.id !== collaboratorId))
        toast({
          title: 'Success',
          description: 'Collaborator removed'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove collaborator',
        variant: 'destructive'
      })
    }
  }

  const createShareLink = async (permissions: 'VIEW' | 'COMMENT' | 'EDIT') => {
    try {
      const response = await fetch(`/api/projects/${projectId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions })
      })

      if (response.ok) {
        const newShareLink = await response.json()
        setShareLinks(prev => [...prev, newShareLink])
        toast({
          title: 'Success',
          description: 'Share link created'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create share link',
        variant: 'destructive'
      })
    }
  }

  const copyShareLink = (token: string) => {
    const shareUrl = `${window.location.origin}/shared/projects/${token}`
    navigator.clipboard.writeText(shareUrl)
    toast({
      title: 'Copied',
      description: 'Share link copied to clipboard'
    })
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'OWNER': return <Shield className="h-4 w-4" />
      case 'EDITOR': return <Edit className="h-4 w-4" />
      case 'COMMENTER': return <Mail className="h-4 w-4" />
      case 'VIEWER': return <Eye className="h-4 w-4" />
      default: return <Users className="h-4 w-4" />
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'OWNER': return 'bg-purple-100 text-purple-800'
      case 'EDITOR': return 'bg-blue-100 text-blue-800'
      case 'COMMENTER': return 'bg-yellow-100 text-yellow-800'
      case 'VIEWER': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share "{projectTitle}"
          </DialogTitle>
          <DialogDescription>
            Collaborate with others on this project
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add Collaborator */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Add Collaborator
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email address"
                    value={newCollaboratorEmail}
                    onChange={(e) => setNewCollaboratorEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select value={newCollaboratorRole} onValueChange={setNewCollaboratorRole as any}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEWER">Viewer</SelectItem>
                      <SelectItem value="COMMENTER">Commenter</SelectItem>
                      <SelectItem value="EDITOR">Editor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button 
                onClick={addCollaborator} 
                disabled={loading || !newCollaboratorEmail}
                className="w-full"
              >
                Add Collaborator
              </Button>
            </CardContent>
          </Card>

          {/* Current Collaborators */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Collaborators ({collaborators.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-40">
                <div className="space-y-3">
                  {collaborators.map((collaborator) => (
                    <motion.div
                      key={collaborator.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={collaborator.user.avatar} />
                          <AvatarFallback>
                            {collaborator.user.name?.[0] || collaborator.user.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {collaborator.user.name || 'Unknown User'}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {collaborator.user.email}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getRoleColor(collaborator.role)}>
                          {getRoleIcon(collaborator.role)}
                          {collaborator.role}
                        </Badge>
                        {collaborator.role !== 'OWNER' && collaborator.userId !== session?.user?.id && (
                          <div className="flex gap-1">
                            <Select
                              value={collaborator.role}
                              onValueChange={(value) => updateCollaboratorRole(collaborator.id, value)}
                            >
                              <SelectTrigger className="w-24 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="VIEWER">Viewer</SelectItem>
                                <SelectItem value="COMMENTER">Commenter</SelectItem>
                                <SelectItem value="EDITOR">Editor</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => removeCollaborator(collaborator.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {collaborators.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      No collaborators yet
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Share Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Share Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => createShareLink('VIEW')}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View Only
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => createShareLink('COMMENT')}
                >
                  <Mail className="h-4 w-4 mr-1" />
                  Comment
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => createShareLink('EDIT')}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              </div>
              
              {shareLinks.length > 0 && (
                <div className="space-y-2">
                  {shareLinks.map((link) => (
                    <div key={link.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        {link.permissions === 'VIEW' && <Eye className="h-4 w-4" />}
                        {link.permissions === 'COMMENT' && <Mail className="h-4 w-4" />}
                        {link.permissions === 'EDIT' && <Edit className="h-4 w-4" />}
                        <span className="text-sm font-medium">{link.permissions}</span>
                        {link.expiresAt && (
                          <span className="text-xs text-muted-foreground">
                            Expires {new Date(link.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyShareLink(link.token)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}