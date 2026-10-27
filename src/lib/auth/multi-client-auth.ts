// Enhanced Authentication System for Multi-Client Support
// JWT tokens, refresh tokens, and cross-platform authentication.
//
// This module now exists for `AuthService` (used by the mobile login route,
// `src/app/api/auth/mobile/login/route.ts`). The Bearer-only `withAuth` route wrapper was
// retired in T034 (ADR-006 D2): every browser-facing route uses inline NextAuth session auth.

import { SignJWT, jwtVerify } from 'jose';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';

// JWT Configuration
const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'fallback-secret-key'
);
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatar: string | null;
  };
}

export interface RefreshTokenData {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  deviceId: string | null;
  deviceName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Enhanced Auth Service
export class AuthService {
  
  // Generate JWT access token
  static async generateAccessToken(userId: string, deviceId?: string): Promise<string> {
    const payload = {
      userId,
      deviceId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (15 * 60), // 15 minutes
    };

    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .sign(JWT_SECRET);
  }

  // Generate secure refresh token
  static async generateRefreshToken(): Promise<string> {
    return randomBytes(64).toString('hex');
  }

  // Store refresh token in database
  static async storeRefreshToken(
    userId: string, 
    token: string, 
    deviceInfo: {
      deviceId?: string;
      deviceName?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<RefreshTokenData> {
    const hashedToken = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days

    return await db.refreshToken.create({
      data: {
        userId,
        token: hashedToken,
        expiresAt,
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
      },
    });
  }

  // Verify JWT token
  static async verifyAccessToken(token: string): Promise<{ userId: string; deviceId?: string } | null> {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      
      if (payload.type !== 'access') {
        return null;
      }

      return {
        userId: payload.userId as string,
        deviceId: payload.deviceId as string,
      };
    } catch (error) {
      return null;
    }
  }

  // Verify and use refresh token
  static async verifyRefreshToken(token: string): Promise<{ userId: string; deviceId?: string } | null> {
    try {
      const hashedToken = createHash('sha256').update(token).digest('hex');
      
      const refreshTokenRecord = await db.refreshToken.findFirst({
        where: {
          token: hashedToken,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });

      if (!refreshTokenRecord) {
        return null;
      }

      return {
        userId: refreshTokenRecord.userId,
        deviceId: refreshTokenRecord.deviceId || undefined,
      };
    } catch (error) {
      return null;
    }
  }

  // Login with credentials
  static async login(
    email: string, 
    password: string, 
    deviceInfo: {
      deviceId?: string;
      deviceName?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AuthTokens | null> {
    try {
      // Find user
      const user = await db.user.findUnique({
        where: { email },
      });

      if (!user) {
        return null;
      }

      // Verify password
      if (!user.password) {
        return null;
      }
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return null;
      }

      // Generate tokens
      const accessToken = await this.generateAccessToken(user.id, deviceInfo.deviceId);
      const refreshToken = await this.generateRefreshToken();

      // Store refresh token
      await this.storeRefreshToken(user.id, refreshToken, deviceInfo);

      // Update last login
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + (15 * 60 * 1000)), // 15 minutes
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      return null;
    }
  }

  // Refresh access token
  static async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresAt: Date } | null> {
    try {
      const tokenData = await this.verifyRefreshToken(refreshToken);
      
      if (!tokenData) {
        return null;
      }

      // Generate new access token
      const accessToken = await this.generateAccessToken(tokenData.userId, tokenData.deviceId);
      
      return {
        accessToken,
        expiresAt: new Date(Date.now() + (15 * 60 * 1000)), // 15 minutes
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      return null;
    }
  }

  // Logout (revoke refresh token)
  static async logout(refreshToken: string): Promise<boolean> {
    try {
      const hashedToken = createHash('sha256').update(refreshToken).digest('hex');
      
      await db.refreshToken.deleteMany({
        where: { token: hashedToken },
      });

      return true;
    } catch (error) {
      console.error('Logout error:', error);
      return false;
    }
  }

  // Logout from all devices
  static async logoutAllDevices(userId: string): Promise<boolean> {
    try {
      await db.refreshToken.deleteMany({
        where: { userId },
      });

      return true;
    } catch (error) {
      console.error('Logout all devices error:', error);
      return false;
    }
  }

  // Get user sessions
  static async getUserSessions(userId: string): Promise<RefreshTokenData[]> {
    return await db.refreshToken.findMany({
      where: { 
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Revoke specific session
  static async revokeSession(userId: string, tokenId: string): Promise<boolean> {
    try {
      await db.refreshToken.delete({
        where: { 
          id: tokenId,
          userId, // Ensure user can only revoke their own sessions
        },
      });

      return true;
    } catch (error) {
      console.error('Revoke session error:', error);
      return false;
    }
  }

  // Register new user
  static async register(
    email: string,
    password: string,
    name: string,
    deviceInfo: {
      deviceId?: string;
      deviceName?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AuthTokens | null> {
    try {
      // Check if user exists
      const existingUser = await db.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return null;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await db.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
        },
      });

      // Generate tokens for immediate login
      const accessToken = await this.generateAccessToken(user.id, deviceInfo.deviceId);
      const refreshToken = await this.generateRefreshToken();

      // Store refresh token
      await this.storeRefreshToken(user.id, refreshToken, deviceInfo);

      return {
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + (15 * 60 * 1000)), // 15 minutes
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
        },
      };
    } catch (error) {
      console.error('Registration error:', error);
      return null;
    }
  }

  // Validate session and get user
  static async validateSession(accessToken: string): Promise<{
    user: {
      id: string;
      email: string;
      name: string | null;
      avatar: string | null;
    };
    deviceId?: string;
  } | null> {
    try {
      const tokenData = await this.verifyAccessToken(accessToken);
      
      if (!tokenData) {
        return null;
      }

      const user = await db.user.findUnique({
        where: { id: tokenData.userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
        },
      });

      if (!user) {
        return null;
      }

      return {
        user,
        deviceId: tokenData.deviceId,
      };
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }
}
