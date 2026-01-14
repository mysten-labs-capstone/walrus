const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testLogin() {
  try {
    const username = 'test'; // Try with the test user
    
    console.log(`\nTesting login for username: "${username}"`);
    console.log(`Normalized: "${username.toLowerCase()}"`);
    
    const user = await prisma.user.findUnique({ 
      where: { username: username.toLowerCase() },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        createdAt: true
      }
    });

    if (!user) {
      console.log('❌ User not found in database');
    } else {
      console.log('✅ User found:');
      console.log('  ID:', user.id);
      console.log('  Username:', user.username);
      console.log('  Created:', user.createdAt);
      console.log('  Password hash exists:', !!user.passwordHash);
      console.log('  Password hash length:', user.passwordHash?.length || 0);
    }

    // Check if there are any users with mixed case
    const allUsers = await prisma.user.findMany({
      select: { username: true }
    });
    
    console.log('\nAll usernames in DB:');
    allUsers.forEach(u => {
      const hasUpperCase = /[A-Z]/.test(u.username);
      console.log(`  ${u.username}${hasUpperCase ? ' ⚠️ (has uppercase!)' : ''}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testLogin();
