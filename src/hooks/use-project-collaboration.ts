'use client'

import { useState } from 'react'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface ProjectCollaborator {
  id: string
  userId: string
  user: {
    id: string
    name: string
    email: string
    avatar?: string
  }
  role: 'OWNER' | 'EDITOR' | 'VIEWER' | 'COMMENTER'
  joinedAt: Date
  permissions: {
    canEdit: boolean
    canComment: boolean
    canShare: boolean
    canManageMembers: boolean
  }
}

interface ShareLink {
  id: string
  token: string
  permission: 'VIEW' | 'COMMENT' | 'EDIT'
  expiresAt?: Date
  password?: boolean
  maxViews?: number
  viewCount: number
  isActive: boolean
}

interface Comment {
  id: string
  content: string
  entityType: string
  entityId: string
  parentId?: string
  author: {
    id: string
    name: string
    email: string
    avatar?: string
  }
  replies: Comment[]
  likes: number
  isLiked: boolean
  isPinned: boolean
  isEdited: boolean
  createdAt: Date
  updatedAt: Date
}

interface ActivityItem {
  id: string
  type: string
  action: string
  entityType: string
  entityId: string
  entityTitle?: string
  user: {
    id: string
    name: string
    email: string
    avatar?: string
  }
  metadata?: any
  createdAt: Date
}

export function useProjectCollaboration(projectId: string) {
  const queryClient = useQueryClient()

  // Fetch sharing data (collaborators and share links)
  const {
    data: sharingData,
    isLoading: isSharingLoading,
    error: sharingError
  } = useQuery({
    queryKey: ['project-sharing', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/share`)
      if (!response.ok) {
        throw new Error('Failed to fetch sharing data')
      }
      const data = await response.json()
      return {
        collaborators: data.collaborators.map((collab: any) => ({
          ...collab,
          joinedAt: new Date(collab.joinedAt)
        })) as ProjectCollaborator[],
        shareLinks: data.shareLinks as ShareLink[]
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch comments
  const {
    data: comments = [],
    isLoading: isCommentsLoading,
    error: commentsError
  } = useQuery({
    queryKey: ['project-comments', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/comments`)
      if (!response.ok) {
        throw new Error('Failed to fetch comments')
      }
      const data = await response.json()
      return data.map((comment: any) => ({
        ...comment,
        createdAt: new Date(comment.createdAt),
        updatedAt: new Date(comment.updatedAt),
        replies: comment.replies.map((reply: any) => ({
          ...reply,
          createdAt: new Date(reply.createdAt),
          updatedAt: new Date(reply.updatedAt)
        }))
      })) as Comment[]
    },
    staleTime: 30 * 1000, // 30 seconds
  })

  // Fetch activity
  const {
    data: activityData,
    isLoading: isActivityLoading,
    error: activityError,
    fetchNextPage,
    hasNextPage
  } = useInfiniteQuery({
    queryKey: ['project-activity', projectId],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const response = await fetch(`/api/projects/${projectId}/activity?page=${pageParam}&limit=20`)
      if (!response.ok) {
        throw new Error('Failed to fetch activity')
      }
      const data = await response.json()
      return {
        activities: data.activities.map((activity: any) => ({
          ...activity,
          createdAt: new Date(activity.createdAt)
        })) as ActivityItem[],
        pagination: data.pagination
      }
    },
    getNextPageParam: (lastPage) => {
      const pagination = lastPage.pagination as {
        page?: number
        hasMore?: boolean
        totalPages?: number
      } | undefined
      if (!pagination) return undefined
      if (pagination.hasMore === false) return undefined
      if (
        typeof pagination.page === 'number' &&
        typeof pagination.totalPages === 'number' &&
        pagination.page >= pagination.totalPages
      ) {
        return undefined
      }
      return (pagination.page ?? 1) + 1
    },
    staleTime: 60 * 1000, // 1 minute
  })

  // Invite user mutation
  const inviteUserMutation = useMutation({
    mutationFn: async ({ email, role, message }: { email: string; role: string; message?: string }) => {
      const response = await fetch(`/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'invite_user',
          email,
          role,
          message
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to invite user')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sharing', projectId] })
    }
  })

  // Create share link mutation
  const createShareLinkMutation = useMutation({
    mutationFn: async (linkData: any) => {
      const response = await fetch(`/api/projects/${projectId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_link',
          ...linkData
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create share link')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sharing', projectId] })
    }
  })

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async ({ content, parentId, entityType = 'project', entityId = projectId }: {
      content: string
      parentId?: string
      entityType?: string
      entityId?: string
    }) => {
      const response = await fetch(`/api/projects/${projectId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          parentId,
          entityType,
          entityId
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add comment')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-comments', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-activity', projectId] })
    }
  })

  // Helper functions
  const inviteUser = (email: string, role: string, message?: string) => {
    return inviteUserMutation.mutateAsync({ email, role, message })
  }

  const createShareLink = (permission: string, options: any) => {
    return createShareLinkMutation.mutateAsync({ permission, ...options })
  }

  const addComment = (content: string, parentId?: string, entityType?: string, entityId?: string) => {
    return addCommentMutation.mutateAsync({ content, parentId, entityType, entityId })
  }

  const updateRole = async (collaboratorId: string, role: string) => {
    // Implementation would go here
    console.log('Update role:', collaboratorId, role)
  }

  const removeCollaborator = async (collaboratorId: string) => {
    // Implementation would go here
    console.log('Remove collaborator:', collaboratorId)
  }

  const updateComment = async (commentId: string, content: string) => {
    // Implementation would go here
    console.log('Update comment:', commentId, content)
  }

  const deleteComment = async (commentId: string) => {
    // Implementation would go here
    console.log('Delete comment:', commentId)
  }

  const likeComment = async (commentId: string) => {
    // Implementation would go here
    console.log('Like comment:', commentId)
  }

  const pinComment = async (commentId: string) => {
    // Implementation would go here
    console.log('Pin comment:', commentId)
  }

  const reportComment = async (commentId: string, reason: string) => {
    // Implementation would go here
    console.log('Report comment:', commentId, reason)
  }

  const updateShareLink = async (linkId: string, updates: any) => {
    // Implementation would go here
    console.log('Update share link:', linkId, updates)
  }

  const deleteShareLink = async (linkId: string) => {
    // Implementation would go here
    console.log('Delete share link:', linkId)
  }

  const updateProjectVisibility = async (isPublic: boolean) => {
    // Implementation would go here
    console.log('Update project visibility:', isPublic)
  }

  const refreshActivity = () => {
    queryClient.invalidateQueries({ queryKey: ['project-activity', projectId] })
  }

  return {
    // Data
    collaborators: sharingData?.collaborators || [],
    shareLinks: sharingData?.shareLinks || [],
    comments,
    activities: activityData?.pages.flatMap(page => page.activities) || [],
    
    // Loading states
    isSharingLoading,
    isCommentsLoading,
    isActivityLoading,
    
    // Errors
    sharingError,
    commentsError,
    activityError,
    
    // Actions
    inviteUser,
    updateRole,
    removeCollaborator,
    createShareLink,
    updateShareLink,
    deleteShareLink,
    updateProjectVisibility,
    addComment,
    updateComment,
    deleteComment,
    likeComment,
    pinComment,
    reportComment,
    refreshActivity,
    
    // Pagination
    hasNextPage,
    fetchNextPage,
    
    // Mutation states
    isInviting: inviteUserMutation.isPending,
    isCreatingLink: createShareLinkMutation.isPending,
    isAddingComment: addCommentMutation.isPending
  }
}