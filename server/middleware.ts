import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const STATIC_ALLOWED = new Set<string>([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://mysten-labs-capstone.netlify.app',
]);

const NETLIFY_PREVIEW_REGEX =
  /^https:\/\/deploy-preview-\d+--mysten-labs-capstone\.netlify\.app$/i;

const VERCEL_PREVIEW_REGEX =
  /^https:\/\/walrus-git-[a-z0-9-]+-neils-projects-3cbdf85d\.vercel\.app$/i;

const VERCEL_PROD = 'https://walrus-three.vercel.app';
const NETLIFY_PROD = 'https://mysten-labs-capstone.netlify.app';

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin') || '';

  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    return handlePreflight(origin);
  }

  // Handle actual request
  const response = NextResponse.next();
  addCorsHeaders(response, origin);
  return response;
}

function handlePreflight(origin: string): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  addCorsHeaders(response, origin);
  return response;
}

function addCorsHeaders(response: NextResponse, origin: string) {
  let allowOrigin: string | null = null;

  if (STATIC_ALLOWED.has(origin)) {
    allowOrigin = origin;
  } else if (NETLIFY_PREVIEW_REGEX.test(origin)) {
    allowOrigin = origin;
  } else if (VERCEL_PREVIEW_REGEX.test(origin)) {
    allowOrigin = origin;
  } else if (origin === VERCEL_PROD) {
    allowOrigin = origin;
  } else if (origin === NETLIFY_PROD) {
    allowOrigin = origin;
  } else if (origin.includes('netlify.app') || origin.includes('vercel.app')) {
    // Allow any Netlify or Vercel preview
    allowOrigin = origin;
  }

  if (allowOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowOrigin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');
  }
}

// Apply to all API routes
export const config = {
  matcher: '/api/:path*',
};
