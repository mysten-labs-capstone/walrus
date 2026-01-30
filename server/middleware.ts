import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const STATIC_ALLOWED = new Set<string>([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:3000',
  'https://mysten-labs-capstone.netlify.app',
]);

const NETLIFY_PREVIEW_REGEX =
  /^https:\/\/deploy-preview-\d+--mysten-labs-capstone\.netlify\.app$/i;

const NETLIFY_ANY_REGEX = /^https:\/\/.+\.netlify\.app$/i;

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  console.log('[Middleware] Request:', request.method, request.url, 'Origin:', origin);
  
  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    console.log('[Middleware] Handling OPTIONS preflight for origin:', origin);
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
    console.log('[Middleware] Matched STATIC_ALLOWED:', origin);
  } else if (NETLIFY_PREVIEW_REGEX.test(origin)) {
    allowOrigin = origin;
    console.log('[Middleware] Matched NETLIFY_PREVIEW_REGEX:', origin);
  } else if (NETLIFY_ANY_REGEX.test(origin)) {
    allowOrigin = origin;
    console.log('[Middleware] Matched NETLIFY_ANY_REGEX:', origin);
  } else {
    console.log('[Middleware] NO MATCH for origin:', origin);
  }

  if (allowOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowOrigin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    console.log('[Middleware] Set CORS headers for:', allowOrigin);
  } else {
    console.log('[Middleware] NOT setting CORS headers - origin not allowed');
  }

  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  response.headers.set('Access-Control-Max-Age', '86400');
  response.headers.set('Vary', 'Origin');
}

// Apply to all API routes
export const config = {
  matcher: '/api/:path*',
};
