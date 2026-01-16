import { NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

/**
 * Test endpoint to verify database connection and operations
 */
export async function GET(req: Request) {
  try {
    console.log('[DB-TEST] Starting database test...');
    console.log('[DB-TEST] DATABASE_URL configured:', process.env.DATABASE_URL ? 'YES (hidden)' : 'NO');
    console.log('[DB-TEST] NODE_ENV:', process.env.NODE_ENV);
    
    // Test 1: Can we connect to the database?
    const userCount = await prisma.user.count();
    console.log('[DB-TEST] ✅ Connection successful. Total users:', userCount);
    
    // Test 2: Can we read a user?
    const sampleUser = await prisma.user.findFirst({
      select: { id: true, username: true, balance: true }
    });
    console.log('[DB-TEST] Sample user:', sampleUser);
    
    // Test 3: Can we perform a balance update test (read-only simulation)?
    if (sampleUser) {
      const beforeBalance = sampleUser.balance;
      console.log(`[DB-TEST] Simulating update for user ${sampleUser.username}...`);
      console.log(`[DB-TEST] Current balance: $${beforeBalance.toFixed(4)}`);
      
      // Perform a test update (increment by 0 to verify write capability)
      const testUpdate = await prisma.user.update({
        where: { id: sampleUser.id },
        data: { balance: { increment: 0 } },
        select: { balance: true }
      });
      console.log(`[DB-TEST] Test update successful. Balance: $${testUpdate.balance.toFixed(4)}`);
      
      // Verify
      const afterUser = await prisma.user.findUnique({
        where: { id: sampleUser.id },
        select: { balance: true }
      });
      console.log(`[DB-TEST] Verification: $${afterUser?.balance.toFixed(4)}`);
    }
    
    return NextResponse.json({
      success: true,
      message: "Database connection and operations working correctly",
      tests: {
        connection: "✅ Connected",
        read: "✅ Can read data",
        write: "✅ Can write data",
        userCount,
        sampleUser: sampleUser ? {
          id: sampleUser.id,
          username: sampleUser.username,
          balance: sampleUser.balance
        } : null
      }
    }, { status: 200, headers: withCORS(req) });
  } catch (err: any) {
    console.error('[DB-TEST] ❌ Database test failed:', err);
    console.error('[DB-TEST] Error message:', err.message);
    console.error('[DB-TEST] Error stack:', err.stack);
    
    return NextResponse.json({
      success: false,
      error: err.message,
      stack: err.stack
    }, { status: 500, headers: withCORS(req) });
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}
