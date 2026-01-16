const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const pendingFiles = await prisma.file.findMany({
    where: { status: 'pending' },
    orderBy: { uploadedAt: 'desc' },
  });

  console.log(`Processing ${pendingFiles.length} pending files...\n`);

  for (const file of pendingFiles) {
    console.log(`Processing ${file.filename} (${file.id})...`);
    
    const response = await fetch('https://walrus-three.vercel.app/api/upload/process-async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId: file.id,
        s3Key: file.s3Key,
        tempBlobId: file.blobId,
        userId: file.userId,
        epochs: file.epochs || 3,
      }),
    });
    
    const status = response.status;
    if (response.ok) {
      const result = await response.json();
      console.log(`  ✓ Success: ${result.blobId}\n`);
    } else {
      const error = await response.text();
      console.log(`  ✗ Failed (${status}): ${error}\n`);
    }
  }
  
  console.log('Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
