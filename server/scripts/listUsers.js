const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({ take: 5 });
    console.log('USERS:', users);
  } catch (err) {
    console.error('ERR', err);
  } finally {
    await prisma.$disconnect();
  }
})();
