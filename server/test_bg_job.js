const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const pendingFile = await prisma.file.findFirst({
    where: { status: 'pending' },
    orderBy: { uploadedAt: 'desc' },
  });
  
  if (!pendingFile) {
    console.log('No pending files');
    return;
  }

  console.log('Triggering background job for:', pendingFile.id);
  console.log('S3 Key:', pendingFile.s3Key);
  
  const response = await fetch('https://walrus-three.vercel.app/api/upload/process-async', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId: pendingFile.id,
      s3Key: pendingFile.s3Key,
      tempBlobId: pendingFile.blobId,
      userId: pendingFile.userId,
      epochs: 3,
    }),
  });
  
  console.log('Response status:', response.status);
  const text = await response.text();
  console.log('Response:', text);
  
  // Check status after
  const updated = await prisma.file.findUnique({
    where: { id: pendingFile.id },
    select: { status: true, blobId: true }
  });
  console.log('Updated status:', updated);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
