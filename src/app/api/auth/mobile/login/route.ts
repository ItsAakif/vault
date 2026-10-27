// Mobile/Desktop Login API Route
//
// CLOSED BY DEFAULT (T080).
//
// This is an email-and-password credential endpoint in an application whose supported sign-in is
// Google. The mobile client is out of scope and is not published, so on a public deployment this
// URL must behave exactly like one that was never written: the gate below runs first and calls
// `notFound()`, which Next answers with its own 404 before the request body is parsed, before the
// rate limiter runs, and before AuthService/Prisma is touched. A closed endpoint therefore does no
// work and discloses nothing -- no 403, no 410, no message naming the feature.
//
// Re-opening is a deliberate, server-side act for a future mobile client:
//
//   MOBILE_PASSWORD_LOGIN_ENABLED="true"
//
// Only the literal string "true" opens it (the same comparison style as SMTP_SECURE and
// NEXT_PUBLIC_CUSTOM_SERVER elsewhere in this repo). Unset, "false", "1" and "TRUE" all stay
// closed. It is deliberately NOT a NEXT_PUBLIC_* variable: that would ship the flag's existence
// to the browser bundle, which is the opposite of the intent.
import { NextRequest, NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { AuthService } from '@/lib/auth/multi-client-auth';
import { rateLimit } from '@/lib/security';

// Read per request, not at module load, so the value is the one the process actually has when the
// request arrives (and so the test can prove both states without re-importing the module).
function isMobilePasswordLoginEnabled(): boolean {
  return process.env.MOBILE_PASSWORD_LOGIN_ENABLED === 'true';
}

// Rate limiting for login attempts
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 login attempts per IP
  message: 'Too many login attempts'
});

export async function POST(request: NextRequest) {
  // Gate first. `notFound()` throws Next's NEXT_HTTP_ERROR_FALLBACK;404, which the App Router's
  // route-handler module turns into `new Response(null, { status: 404 })` -- the same 404 any
  // unknown route produces, decided before a single byte of the body is read.
  if (!isMobilePasswordLoginEnabled()) {
    notFound();
  }

  try {
    // Apply rate limiting
    const rateLimitResponse = await loginRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { email, password, deviceInfo } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Email and password are required' 
        },
        { status: 400 }
      );
    }

    // Get device info
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const deviceData = {
      deviceId: deviceInfo?.deviceId,
      deviceName: deviceInfo?.deviceName,
      ipAddress: clientIP,
      userAgent: userAgent,
    };

    // Attempt login
    const authResult = await AuthService.login(email, password, deviceData);

    if (!authResult) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid email or password' 
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: authResult
    });

  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
