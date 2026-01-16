async function main() {
  const response = await fetch('https://walrus-three.vercel.app/api/upload/process-async', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId: '919748ae-b301-4116-898f-c9487adc4127',
      s3Key: 'uploads/168ed6ce-b59a-4d49-9b41-afac60e3fbe9/temp_1768452414222_oljc79/Headshot.JPEG',
      tempBlobId: 'temp_1768452414222_oljc79',
      userId: '168ed6ce-b59a-4d49-9b41-afac60e3fbe9',
      epochs: 3,
    }),
  });
  
  console.log('Status:', response.status);
  const text = await response.text();
  console.log('Response:', text);
}

main().catch(console.error);
