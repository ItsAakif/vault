'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { 
  MessageSquare, 
  Reply, 
  Heart, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Pin, 
  Flag,
  Send,
  AtSign,
  Paperclip,
  Smile
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

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

interface ProjectCommentsProps {
  projectId: string
  entityType: string
  entityId: string
  comments: Comment[]
  currentUserId: string
  onAddComment: (content: string, parentId?: string) => Promise<void>
  onUpdateComment: (commentId: string, content: string) => Promise<void>
  onDeleteComment: (commentId: string) => Promise<void>
  onLikeComment: (commentId: string) => Promise<void>
  onPinComment: (commentId: string) => Promise<void>
  onReportComment: (commentId: string, reason: string) => Promise<void>
}

export function ProjectComments({
  projectId,
  entityType,
  entityId,
  comments,
  currentUserId,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onLikeComment,
  onPinComment,
  onReportComment
}: ProjectCommentsProps) {
  const [newComment, setNewComment] = React.useState('')
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null)
  const [editingComment, setEditingComment] = React.useState<string | null>(null)
  const [editContent, setEditContent] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Sort comments: pinned first, then by creation date
  const sortedComments = React.useMemo(() => {
    return [...comments].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [comments])

  const handleSubmitComment = async (content: string, parentId?: string) => {
    if (!content.trim()) return

    setIsSubmitting(true)
    try {
      await onAddComment(content, parentId)
      setNewComment('')
      setReplyingTo(null)
      toast.success('Comment added successfully')
    } catch (error) {
      toast.error('Failed to add comment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditComment = async (commentId: string, content: string) => {
    if (!content.trim()) return

    try {
      await onUpdateComment(commentId, content)
      setEditingComment(null)
      setEditContent('')
      toast.success('Comment updated successfully')
    } catch (error) {
      toast.error('Failed to update comment')
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      await onDeleteComment(commentId)
      toast.success('Comment deleted successfully')
    } catch (error) {
      toast.error('Failed to delete comment')
    }
  }

  const handleLikeComment = async (commentId: string) => {
    try {
      await onLikeComment(commentId)
    } catch (error) {
      toast.error('Failed to like comment')
    }
  }

  const handlePinComment = async (commentId: string) => {
    try {
      await onPinComment(commentId)
      toast.success('Comment pinned successfully')
    } catch (error) {
      toast.error('Failed to pin comment')
    }
  }

  const CommentItem = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => {
    const isAuthor = comment.author.id === currentUserId
    const canEdit = isAuthor
    const canDelete = isAuthor
    const canPin = !isReply // Only top-level comments can be pinned

    return (
      <div className={`space-y-3 ${isReply ? 'ml-12 border-l-2 border-muted pl-4' : ''}`}>
        <div className="flex items-start gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={comment.author.avatar} />
            <AvatarFallback>
              {comment.author.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{comment.author.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
              </span>
              {comment.isEdited && (
                <Badge variant="outline" className="text-xs">
                  Edited
                </Badge>
              )}
              {comment.isPinned && (
                <Badge variant="secondary" className="text-xs">
                  <Pin className="h-3 w-3 mr-1" />
                  Pinned
                </Badge>
              )}
            </div>
            
            {editingComment === comment.id ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Edit your comment..."
                  className="min-h-[80px]"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleEditComment(comment.id, editContent)}
                  >
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingComment(null)
                      setEditContent('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm whitespace-pre-wrap">{comment.content}</div>
            )}
            
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleLikeComment(comment.id)}
                className={`h-8 px-2 ${comment.isLiked ? 'text-red-500' : ''}`}
              >
                <Heart className={`h-3 w-3 mr-1 ${comment.isLiked ? 'fill-current' : ''}`} />
                {comment.likes > 0 && comment.likes}
              </Button>
              
              {!isReply && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyingTo(comment.id)}
                  className="h-8 px-2"
                >
                  <Reply className="h-3 w-3 mr-1" />
                  Reply
                </Button>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && (
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingComment(comment.id)
                        setEditContent(comment.content)
                      }}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canPin && (
                    <DropdownMenuItem onClick={() => handlePinComment(comment.id)}>
                      <Pin className="h-4 w-4 mr-2" />
                      {comment.isPinned ? 'Unpin' : 'Pin'}
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem
                      onClick={() => handleDeleteComment(comment.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                  {!isAuthor && (
                    <DropdownMenuItem
                      onClick={() => onReportComment(comment.id, 'inappropriate')}
                      className="text-destructive"
                    >
                      <Flag className="h-4 w-4 mr-2" />
                      Report
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        
        {/* Reply Form */}
        {replyingTo === comment.id && (
          <div className="ml-11 space-y-2">
            <Textarea
              placeholder={`Reply to ${comment.author.name}...`}
              className="min-h-[80px]"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleSubmitComment(newComment, comment.id)}
                disabled={isSubmitting || !newComment.trim()}
              >
                <Send className="h-3 w-3 mr-1" />
                Reply
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setReplyingTo(null)
                  setNewComment('')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        
        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="space-y-4">
            {comment.replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} isReply={true} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <h3 className="text-lg font-semibold">
            Comments ({comments.length})
          </h3>
        </div>
      </div>

      {/* New Comment Form */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[100px]"
            />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <AtSign className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Smile className="h-4 w-4" />
                </Button>
              </div>
              
              <Button
                onClick={() => handleSubmitComment(newComment)}
                disabled={isSubmitting || !newComment.trim()}
              >
                <Send className="h-4 w-4 mr-2" />
                Comment
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comments List */}
      <div className="space-y-6">
        {sortedComments.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Comments Yet</h3>
              <p className="text-muted-foreground text-center">
                Be the first to start a discussion about this project
              </p>
            </CardContent>
          </Card>
        ) : (
          sortedComments.map((comment) => (
            <Card key={comment.id}>
              <CardContent className="pt-6">
                <CommentItem comment={comment} />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}