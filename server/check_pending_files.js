const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const files = await prisma.file.findMany({
    where: { status: 'pending' },
    orderBy: { uploadedAt: 'desc' },
    take: 3,
    select: {
      id: true,
      filename: true,
      status: true,
      s3Key: true,
      blobId: true,
      uploadedAt: true,
    }
  });
  console.log('Pending files:', JSON.stringify(files, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
