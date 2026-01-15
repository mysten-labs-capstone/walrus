const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const files = await prisma.file.findMany({
    orderBy: { uploadedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      filename: true,
      status: true,
      s3Key: true,
      blobId: true,
      uploadedAt: true,
      userId: true,
    }
  });
  console.log(JSON.stringify(files, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
