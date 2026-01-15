# Walrus Upload Netlify Fix

## Problem
Uploads were failing on Netlify preview deployments with the error: **"Too many failures while uploading to blob"**

This worked on localhost because the server runs directly without function timeouts. However, Netlify serverless functions have a default timeout of 10-30 seconds, which is insufficient for:
1. Uploading files to Walrus storage nodes
2. Waiting for Walrus to replicate data across the network
3. Verifying blob availability

## Solution
Made the following changes to extend timeouts and improve error handling:

### Backend Changes

#### 1. **server/app/api/upload/route.ts**
- ✅ Added `export const maxDuration = 300;` (5 minutes) for Vercel/Netlify compatibility
- ✅ Increased individual upload timeout from 60s to 120s per attempt
- ✅ Kept 3 retry attempts with exponential backoff

#### 2. **server/app/api/download/route.ts**
- ✅ Added `export const maxDuration = 300;` (5 minutes)

#### 3. **server/app/api/delete/route.ts**
- ✅ Added `export const maxDuration = 300;` (5 minutes)

#### 4. **server/utils/walrusClient.ts**
- ✅ Increased storage node client timeout from 180s to 300s (5 minutes)
- This allows more time for requests to Walrus storage nodes to complete

### Frontend Changes

#### 5. **client/src/hooks/useUploadQueue.ts**
- ✅ Improved error message parsing to extract JSON error details
- ✅ Added user-friendly error messages for common issues:
  - "Network timeout" for timeout/failure errors
  - "Insufficient balance" for payment errors
- ✅ Added try-catch wrapper around entire processOne function
- ✅ Better error state handling for unexpected failures

## What This Fixes
- ✅ Uploads on Netlify preview will no longer timeout
- ✅ Better retry logic with exponential backoff
- ✅ More informative error messages for users
- ✅ Support for larger files that take longer to upload
- ✅ Proper handling of network delays in distributed systems

## Testing
1. **Deploy to Netlify preview** - uploads should now work
2. **Test with various file sizes** - especially larger files (10MB+)
3. **Test error scenarios**:
   - Low balance → should show "Insufficient balance" error
   - Network interrupt → should show "Network timeout" error
   - Normal success → should complete and show in Recent Uploads

## Notes
- The 5-minute maxDuration is the maximum allowed on Vercel's free plan
- Pro plans can extend to 30 minutes if needed
- For production, monitor upload times and adjust timeouts based on actual usage patterns
- The Walrus network performance can vary; retries with backoff handle temporary glitches
