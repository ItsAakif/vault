import { Server as HTTPServer } from 'http'
import { Server as SocketIOServer, Socket } from 'socket.io'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db as prisma } from '@/lib/db'
import { logger } from '@/lib/logger'

interface AuthenticatedSocket extends Socket {
  userId?: string
  user?: {
    id: string
    name?: string
    email: string
  }
}

interface PresenceData {
  userId: string
  userName: string
  location: string
  lastSeen: Date
  isActive: boolean
}

interface SyncOperation {
  id: string
  type: 'create' | 'update' | 'delete'
  entity: string
  entityId: string
  data: any
  userId: string
  timestamp: Date
  version: number
}

class SocketManager {
  private io: SocketIOServer | null = null
  private presenceMap = new Map<string, PresenceData>()
  private syncQueue = new Map<string, SyncOperation[]>()
  private operationHistory = new Map<string, SyncOperation[]>()

  initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    })

    this.io.use(this.authenticateSocket.bind(this))
    this.io.on('connection', this.handleConnection.bind(this))

    logger.info('Socket.IO server initialized')
  }

  private async authenticateSocket(socket: AuthenticatedSocket, next: (err?: Error) => void) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1]
      
      if (!token) {
        return next(new Error('Authentication token required'))
      }

      // In a real implementation, you'd verify the JWT token here
      // For now, we'll use a simplified approach
      const session = await this.verifyToken(token)
      
      if (!session?.user) {
        return next(new Error('Invalid authentication token'))
      }

      socket.userId = session.user.id
      socket.user = session.user
      next()
    } catch (error) {
      logger.error('Socket authentication error:', error)
      next(new Error('Authentication failed'))
    }
  }

  private async verifyToken(token: string) {
    try {
      const jwt = require('jsonwebtoken')
      
      // Verify JWT token with secret
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as { sub?: string, email?: string }
      
      if (!decoded.sub) {
        return null
      }
      
      // Fetch user from database
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true
        }
      })
      
      if (!user || !user.isActive) {
        return null
      }
      
      return {
        user: {
          id: user.id,
          name: user.name || undefined,
          email: user.email
        }
      }
    } catch (error) {
      logger.error('Token verification error:', error)
      return null
    }
  }

  private handleConnection(socket: AuthenticatedSocket) {
    if (!socket.userId || !socket.user) {
      socket.disconnect()
      return
    }

    logger.info(`User ${socket.user.email} connected with socket ${socket.id}`)

    // Join user to their personal room
    socket.join(`user:${socket.userId}`)

    // Handle presence tracking
    this.handlePresence(socket)

    // Handle sync operations
    this.handleSyncOperations(socket)

    // Handle project collaboration
    this.handleProjectCollaboration(socket)

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket)
    })
  }

  private handlePresence(socket: AuthenticatedSocket) {
    // Update presence when user joins
    socket.on('presence:update', (data: { location: string }) => {
      if (!socket.userId || !socket.user) return

      const presenceData: PresenceData = {
        userId: socket.userId,
        userName: socket.user.name || socket.user.email,
        location: data.location,
        lastSeen: new Date(),
        isActive: true
      }

      this.presenceMap.set(socket.userId, presenceData)

      // Broadcast presence update to relevant rooms
      this.broadcastPresenceUpdate(socket, presenceData)

      // Update database
      this.updatePresenceInDatabase(socket.userId, data.location)
    })

    // Handle presence heartbeat
    socket.on('presence:heartbeat', () => {
      if (!socket.userId) return

      const presence = this.presenceMap.get(socket.userId)
      if (presence) {
        presence.lastSeen = new Date()
        presence.isActive = true
        this.presenceMap.set(socket.userId, presence)
      }
    })

    // Get presence for a specific context
    socket.on('presence:get', (data: { context: string }, callback) => {
      const contextPresence = Array.from(this.presenceMap.values())
        .filter(p => p.location.startsWith(data.context))
      
      callback(contextPresence)
    })
  }

  private handleSyncOperations(socket: AuthenticatedSocket) {
    // Handle sync operation from client
    socket.on('sync:operation', async (operation: Omit<SyncOperation, 'id' | 'timestamp' | 'version'>) => {
      if (!socket.userId) return

      const syncOp: SyncOperation = {
        ...operation,
        id: this.generateOperationId(),
        userId: socket.userId,
        timestamp: new Date(),
        version: this.getNextVersion(operation.entityId)
      }

      try {
        // Apply operation locally
        await this.applySyncOperation(syncOp)

        // Add to operation history
        this.addToOperationHistory(syncOp)

        // Broadcast to other clients
        this.broadcastSyncOperation(socket, syncOp)

        // Acknowledge to sender
        socket.emit('sync:ack', { operationId: syncOp.id, success: true })

        logger.info(`Sync operation applied: ${syncOp.type} ${syncOp.entity}:${syncOp.entityId}`)
      } catch (error) {
        logger.error('Sync operation failed:', error)
        socket.emit('sync:ack', { 
          operationId: syncOp.id, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Handle sync conflict resolution
    socket.on('sync:resolve-conflict', async (data: { 
      operationId: string
      resolution: 'accept' | 'reject' | 'merge'
      mergedData?: any 
    }) => {
      try {
        await this.resolveConflict(data.operationId, data.resolution, data.mergedData)
        socket.emit('sync:conflict-resolved', { operationId: data.operationId })
      } catch (error) {
        logger.error('Conflict resolution failed:', error)
        socket.emit('sync:conflict-resolution-failed', { 
          operationId: data.operationId, 
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Handle sync queue request
    socket.on('sync:get-queue', (callback) => {
      if (!socket.userId) return

      const userQueue = this.syncQueue.get(socket.userId) || []
      callback(userQueue)
    })
  }

  private handleProjectCollaboration(socket: AuthenticatedSocket) {
    // Join project room
    socket.on('project:join', async (data: { projectId: string }) => {
      if (!socket.userId) return

      try {
        // Verify user has access to project
        const hasAccess = await this.verifyProjectAccess(socket.userId, data.projectId)
        if (!hasAccess) {
          socket.emit('project:join-failed', { projectId: data.projectId, error: 'Access denied' })
          return
        }

        socket.join(`project:${data.projectId}`)
        socket.emit('project:joined', { projectId: data.projectId })

        // Notify other project members
        socket.to(`project:${data.projectId}`).emit('project:user-joined', {
          userId: socket.userId,
          userName: socket.user?.name || socket.user?.email
        })

        logger.info(`User ${socket.userId} joined project ${data.projectId}`)
      } catch (error) {
        logger.error('Project join failed:', error)
        socket.emit('project:join-failed', { 
          projectId: data.projectId, 
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    // Leave project room
    socket.on('project:leave', (data: { projectId: string }) => {
      socket.leave(`project:${data.projectId}`)
      socket.to(`project:${data.projectId}`).emit('project:user-left', {
        userId: socket.userId,
        userName: socket.user?.name || socket.user?.email
      })
    })

    // Handle real-time editing
    socket.on('project:edit', (data: { 
      projectId: string
      field: string
      value: any
      cursorPosition?: number 
    }) => {
      socket.to(`project:${data.projectId}`).emit('project:edit-update', {
        userId: socket.userId,
        userName: socket.user?.name || socket.user?.email,
        ...data
      })
    })

    // Handle cursor tracking
    socket.on('project:cursor', (data: { 
      projectId: string
      field: string
      position: number 
    }) => {
      socket.to(`project:${data.projectId}`).emit('project:cursor-update', {
        userId: socket.userId,
        userName: socket.user?.name || socket.user?.email,
        ...data
      })
    })
  }

  private handleDisconnection(socket: AuthenticatedSocket) {
    if (!socket.userId) return

    logger.info(`User ${socket.userId} disconnected`)

    // Update presence
    const presence = this.presenceMap.get(socket.userId)
    if (presence) {
      presence.isActive = false
      presence.lastSeen = new Date()
      this.presenceMap.set(socket.userId, presence)
    }

    // Broadcast presence update
    this.broadcastPresenceUpdate(socket, presence)

    // Update database
    this.updatePresenceInDatabase(socket.userId, '', false)
  }

  private broadcastPresenceUpdate(socket: AuthenticatedSocket, presence?: PresenceData) {
    if (!presence) return

    // Broadcast to users in the same location/context
    const contextRoom = `location:${presence.location.split('/')[0]}`
    socket.to(contextRoom).emit('presence:update', presence)
  }

  private async updatePresenceInDatabase(userId: string, location: string, isActive: boolean = true) {
    try {
      // Find existing session for this user
      const existingSession = await prisma.presenceSession.findFirst({
        where: { userId, isActive: true }
      })

      if (existingSession) {
        // Update existing session
        await prisma.presenceSession.update({
          where: { id: existingSession.id },
          data: {
            location,
            isActive,
            lastSeen: new Date()
          }
        })
      } else {
        // Create new session
        await prisma.presenceSession.create({
          data: {
            userId,
            sessionId: this.generateSessionId(),
            location,
            isActive,
            lastSeen: new Date()
          }
        })
      }
    } catch (error) {
      logger.error('Failed to update presence in database:', error)
    }
  }

  private async applySyncOperation(operation: SyncOperation): Promise<void> {
    // Apply the operation to the database
    switch (operation.entity) {
      case 'project':
        await this.applySyncToProject(operation)
        break
      case 'task':
        await this.applySyncToTask(operation)
        break
      case 'content':
        await this.applySyncToContent(operation)
        break
      default:
        throw new Error(`Unknown entity type: ${operation.entity}`)
    }
  }

  private async applySyncToProject(operation: SyncOperation): Promise<void> {
    switch (operation.type) {
      case 'update':
        await prisma.project.update({
          where: { id: operation.entityId },
          data: operation.data
        })
        break
      // Add other operation types as needed
    }
  }

  private async applySyncToTask(operation: SyncOperation): Promise<void> {
    switch (operation.type) {
      case 'create':
        await prisma.task.create({
          data: { ...operation.data, id: operation.entityId }
        })
        break
      case 'update':
        await prisma.task.update({
          where: { id: operation.entityId },
          data: operation.data
        })
        break
      case 'delete':
        await prisma.task.delete({
          where: { id: operation.entityId }
        })
        break
    }
  }

  private async applySyncToContent(operation: SyncOperation): Promise<void> {
    switch (operation.type) {
      case 'update':
        await prisma.contentItem.update({
          where: { id: operation.entityId },
          data: operation.data
        })
        break
      // Add other operation types as needed
    }
  }

  private broadcastSyncOperation(sender: AuthenticatedSocket, operation: SyncOperation) {
    // Broadcast to all clients except sender
    sender.broadcast.emit('sync:operation', operation)
  }

  private addToOperationHistory(operation: SyncOperation) {
    const entityHistory = this.operationHistory.get(operation.entityId) || []
    entityHistory.push(operation)
    
    // Keep only last 100 operations per entity
    if (entityHistory.length > 100) {
      entityHistory.shift()
    }
    
    this.operationHistory.set(operation.entityId, entityHistory)
  }

  private async resolveConflict(operationId: string, resolution: string, mergedData?: any) {
    // Implementation for conflict resolution
    // This would involve complex logic to merge conflicting changes
    logger.info(`Resolving conflict for operation ${operationId} with resolution: ${resolution}`)
  }

  private async verifyProjectAccess(userId: string, projectId: string): Promise<boolean> {
    try {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { userId },
            { collaborators: { some: { userId } } }
          ]
        }
      })
      
      return !!project
    } catch (error) {
      logger.error('Project access verification failed:', error)
      return false
    }
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getNextVersion(entityId: string): number {
    const history = this.operationHistory.get(entityId) || []
    return history.length + 1
  }

  // Public methods for external use
  public emitToUser(userId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data)
    }
  }

  public emitToProject(projectId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`project:${projectId}`).emit(event, data)
    }
  }

  public getPresence(userId: string): PresenceData | undefined {
    return this.presenceMap.get(userId)
  }

  public getAllPresence(): PresenceData[] {
    return Array.from(this.presenceMap.values())
  }
}

export const socketManager = new SocketManager()
export default socketManager
