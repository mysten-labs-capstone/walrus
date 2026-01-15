const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const file = await prisma.file.findFirst({
    where: { 
      status: 'pending',
      filename: 'Headshot.JPEG'
    },
    orderBy: { uploadedAt: 'desc' },
  });
  
  if (!file) {
    console.log('File not found');
    return;
  }

  console.log('Triggering for:', file.id, file.filename);
  
  const response = await fetch('https://walrus-three.vercel.app/api/upload/process-async', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId: file.id,
      s3Key: file.s3Key,
      tempBlobId: file.blobId,
      userId: file.userId,
      epochs: 3,
    }),
  });
  
  console.log('Status:', response.status);
  const text = await response.text();
  console.log('Response:', text);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
