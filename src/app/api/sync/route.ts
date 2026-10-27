// Sync API Routes - Handle offline synchronization
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { offlineSync } from '@/lib/sync/offline-sync';

// GET /api/sync - Get sync status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const status = await offlineSync.getSyncStatus(userId);

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Sync status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}

// POST /api/sync - Trigger sync
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { changes } = await request.json();

    // Queue offline changes if provided
    if (changes && Array.isArray(changes)) {
      const deviceId = 'unknown';
      
      for (const change of changes) {
        await offlineSync.queueChange({
          ...change,
          userId,
          deviceId,
        });
      }
    }

    // Perform sync
    const syncResult = await offlineSync.syncChanges(userId);

    return NextResponse.json({
      success: true,
      data: syncResult,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Sync failed' },
      { status: 500 }
    );
  }
}