async function main() {
  const response = await fetch('https://walrus-three.vercel.app/api/upload/trigger-pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  
  console.log('Status:', response.status);
  const json = await response.json();
  console.log('Response:', JSON.stringify(json, null, 2));
}

main().catch(console.error);
