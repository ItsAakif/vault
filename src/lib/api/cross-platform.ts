// API Routes for Cross-Platform Clients
// Standardized REST API endpoints for mobile and desktop apps

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { ContentType } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { rateLimit } from '@/lib/security';

// Rate limiting for API endpoints
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  message: 'Too many API requests from this IP'
});

// Standardized API response wrapper
export function createApiResponse<T>(
  data?: T,
  error?: string,
  status: number = 200
): NextResponse {
  const response = {
    success: status >= 200 && status < 300,
    data,
    error,
    timestamp: new Date().toISOString()
  };

  return NextResponse.json(response, { status });
}

// Authentication middleware for API routes
export async function withAuth(handler: Function) {
  return async (request: NextRequest) => {
    try {
      // Check rate limiting
      const rateLimitResponse = await apiRateLimit(request);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      // Get session from NextAuth
      const session = await getServerSession(authOptions);
      
      if (!session?.user) {
        return createApiResponse(null, 'Unauthorized', 401);
      }

      // Add user to request context
      (request as any).user = session.user;
      
      return await handler(request);
    } catch (error) {
      console.error('API Error:', error);
      return createApiResponse(null, 'Internal server error', 500);
    }
  };
}

// Health Check Endpoint
export async function GET() {
  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`;
    
    return createApiResponse({
      status: 'healthy',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: process.env.REDIS_URL ? 'connected' : 'disabled'
      }
    });
  } catch (error) {
    return createApiResponse(null, 'Service unhealthy', 503);
  }
}

// Authentication API
export const authAPI = {
  // Login endpoint
  login: async (request: NextRequest) => {
    try {
      const { email, password, rememberMe } = await request.json();

      if (!email || !password) {
        return createApiResponse(null, 'Email and password required', 400);
      }

      // Authenticate user (implementation depends on your auth system)
      const user = await authenticateUser(email, password);
      
      if (!user) {
        return createApiResponse(null, 'Invalid credentials', 401);
      }

      // Generate tokens
      const tokens = await generateTokens(user.id, rememberMe);
      
      return createApiResponse({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar
        },
        ...tokens
      });
    } catch (error) {
      return createApiResponse(null, 'Login failed', 500);
    }
  },

  // Token refresh endpoint
  refresh: async (request: NextRequest) => {
    try {
      const { refreshToken } = await request.json();

      if (!refreshToken) {
        return createApiResponse(null, 'Refresh token required', 400);
      }

      const tokens = await refreshTokens(refreshToken);
      
      if (!tokens) {
        return createApiResponse(null, 'Invalid refresh token', 401);
      }

      return createApiResponse(tokens);
    } catch (error) {
      return createApiResponse(null, 'Token refresh failed', 500);
    }
  }
};

// Content Management API
export const contentAPI = {
  // Get all content with pagination
  getAll: withAuth(async (request: NextRequest) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const type = url.searchParams.get('type');
    const search = url.searchParams.get('search');
    
    const skip = (page - 1) * limit;
    
    const contentTypeFilter: ContentType | undefined =
      type && (Object.values(ContentType) as string[]).includes(type)
        ? (type as ContentType)
        : undefined;

    const where: Prisma.ContentItemWhereInput = {
      userId: (request as any).user.id,
      ...(contentTypeFilter && { type: contentTypeFilter }),
      ...(search && {
        OR: [
          { title: { contains: search } },
          { content: { contains: search } }
        ]
      })
    };

    const [items, total] = await Promise.all([
      db.contentItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          category: true,
          tags: true
        }
      }),
      db.contentItem.count({ where })
    ]);

    return createApiResponse({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  }),

  // Create new content
  create: withAuth(async (request: NextRequest) => {
    const data = await request.json();
    
    const item = await db.contentItem.create({
      data: {
        ...data,
        userId: (request as any).user.id
      },
      include: {
        category: true,
        tags: true
      }
    });

    return createApiResponse(item, undefined, 201);
  }),

  // Update content
  update: withAuth(async (request: NextRequest) => {
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    const data = await request.json();
    
    const item = await db.contentItem.update({
      where: { 
        id,
        userId: (request as any).user.id 
      },
      data,
      include: {
        category: true,
        tags: true
      }
    });

    return createApiResponse(item);
  }),

  // Delete content
  delete: withAuth(async (request: NextRequest) => {
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    
    await db.contentItem.delete({
      where: { 
        id,
        userId: (request as any).user.id 
      }
    });

    return createApiResponse({ deleted: true });
  })
};

// Project Management API
export const projectAPI = {
  // Get all projects
  getAll: withAuth(async (request: NextRequest) => {
    const projects = await db.project.findMany({
      where: { userId: (request as any).user.id },
      include: {
        tasks: true,
        milestones: true,
        _count: {
          select: {
            tasks: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return createApiResponse(projects);
  }),

  // Get project by ID
  getById: withAuth(async (request: NextRequest) => {
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    
    const project = await db.project.findUnique({
      where: { 
        id,
        userId: (request as any).user.id 
      },
      include: {
        tasks: {
          include: {
            assignee: true
          }
        },
        milestones: true,
        collaborators: {
          include: {
            user: true
          }
        }
      }
    });

    if (!project) {
      return createApiResponse(null, 'Project not found', 404);
    }

    return createApiResponse(project);
  })
};

// File Management API
export const fileAPI = {
  // List cloud files
  listCloudFiles: withAuth(async (request: NextRequest) => {
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider');
    const folderId = url.searchParams.get('folderId');
    
    // Implementation depends on cloud storage setup
    const files = await getCloudFiles(provider || '', folderId || '', (request as any).user.id);
    
    return createApiResponse(files);
  }),

  // Upload file
  upload: withAuth(async (request: NextRequest) => {
    try {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const provider = formData.get('provider') as string;
      
      if (!file) {
        return createApiResponse(null, 'No file provided', 400);
      }

      // Upload file (implementation depends on storage setup)
      const uploadedFile = await uploadFile(file, provider, (request as any).user.id);
      
      return createApiResponse(uploadedFile, undefined, 201);
    } catch (error) {
      return createApiResponse(null, 'File upload failed', 500);
    }
  })
};

// Sync API for offline support
export const syncAPI = {
  // Get sync status
  getStatus: withAuth(async (request: NextRequest) => {
    const userId = (request as any).user.id;
    
    // Get last sync time and pending changes
    const lastSync = await db.syncLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    const pendingChanges = await db.offlineChange.count({
      where: { 
        userId,
        synced: false
      }
    });

    return createApiResponse({
      lastSync: lastSync?.createdAt || null,
      pendingChanges,
      isOnline: true, // This would be determined by actual connectivity
      syncInProgress: false // This would be tracked in real implementation
    });
  }),

  // Sync changes
  sync: withAuth(async (request: NextRequest) => {
    const { changes } = await request.json();
    const userId = (request as any).user.id;
    
    // Process pending changes
    const results = await processSyncChanges(userId, changes);
    
    return createApiResponse(results);
  })
};

// Utility functions (to be implemented)
interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string | null;
  avatar?: string | null;
}

async function authenticateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
  // Implementation depends on your auth system
  return null;
}

async function generateTokens(userId: string, rememberMe: boolean) {
  // Generate JWT tokens
  return {
    token: 'jwt-token',
    refreshToken: 'refresh-token',
    expiresAt: new Date(Date.now() + (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000)
  };
}

async function refreshTokens(refreshToken: string) {
  // Refresh JWT tokens
  return null;
}

async function getCloudFiles(provider: string, folderId: string, userId: string) {
  // Get files from cloud storage
  return [];
}

async function uploadFile(file: File, provider: string, userId: string) {
  // Upload file to cloud storage
  return null;
}

async function processSyncChanges(userId: string, changes: any[]) {
  // Process offline changes and sync
  return { processed: changes.length, conflicts: [] };
}