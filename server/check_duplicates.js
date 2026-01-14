const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicates() {
  try {
    // Find duplicate usernames (case-insensitive)
    const users = await prisma.user.findMany({
      select: { id: true, username: true, createdAt: true }
    });

    const userMap = new Map();
    const duplicates = [];

    for (const user of users) {
      const lower = user.username.toLowerCase();
      if (userMap.has(lower)) {
        duplicates.push({
          original: userMap.get(lower),
          duplicate: user
        });
      } else {
        userMap.set(lower, user);
      }
    }

    console.log('\nTotal users:', users.length);
    console.log('Unique usernames (case-insensitive):', userMap.size);
    
    if (duplicates.length > 0) {
      console.log('\n⚠️  DUPLICATES FOUND:');
      duplicates.forEach(({ original, duplicate }) => {
        console.log(`  - "${original.username}" (${original.id}) vs "${duplicate.username}" (${duplicate.id})`);
      });
    } else {
      console.log('\n✅ No duplicates found');
    }

    // Show all usernames
    console.log('\nAll usernames:');
    users.forEach(u => {
      console.log(`  ${u.username} (${u.id})`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicates();
