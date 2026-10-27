import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/integrations - Get user's cloud integrations
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // Get all cloud integrations for the user
    const cloudIntegrations = await db.cloudIntegration.findMany({
      where: {
        userId
      },
      select: {
        id: true,
        provider: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        scopes: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // CloudIntegration has no metadata column; keep the response shape stable.
    const integrations = cloudIntegrations.map(integration => ({
      ...integration,
      metadata: null,
      scopes: integration.scopes ? JSON.parse(integration.scopes) : []
    }));

    return NextResponse.json({
      success: true,
      integrations
    });
  } catch (error) {
    console.error('Error fetching integrations:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}

// POST /api/integrations - Create a new integration (placeholder for future providers)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const body = await request.json();
    const { provider, config } = body;

    // For now, only Google Drive is supported via the dedicated endpoints
    if (provider === 'google') {
      return NextResponse.json(
        { success: false, error: 'Use /api/drive/auth for Google Drive integration' },
        { status: 400 }
      );
    }

    // Future providers can be added here
    return NextResponse.json(
      { success: false, error: 'Provider not supported yet' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error creating integration:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create integration' },
      { status: 500 }
    );
  }
}