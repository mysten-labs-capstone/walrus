/**
 * Sui Blockchain Contract Integration
 * 
 * Handles interactions with the FileRegistry smart contract on Sui blockchain.
 * Implements sponsored transactions where:
 * - User keypair signs for ownership proof (tx_context::sender())
 * - App keypair signs to pay gas fees (setGasOwner)
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { deriveSuiKeypair } from './crypto';

const suiClient = new SuiClient({ 
  url: import.meta.env.VITE_SUI_RPC_URL 
});
const PACKAGE_ID = import.meta.env.VITE_SOVEREIGNTY_PACKAGE_ID;

/**
 * Get user's Sui address from master key
 */
export function getUserAddress(masterKey: Uint8Array): string {
  return deriveSuiKeypair(masterKey).toSuiAddress();
}

/**
 * Find user's FileRegistry object on blockchain by querying RegistryCreated events
 * Returns null if not yet created
 */
export async function findUserRegistry(userAddress: string): Promise<string | null> {
  if (!PACKAGE_ID) {
    console.warn('[Blockchain] VITE_SOVEREIGNTY_PACKAGE_ID not configured, skipping registry lookup');
    return null;
  }

  try {
    // Query all RegistryCreated events for this package with pagination
    let allEvents: any[] = [];
    let cursor: string | null | undefined = null;
    let hasNextPage = true;

    // Fetch all pages of events (max 5 pages to prevent infinite loops)
    for (let i = 0; i < 5 && hasNextPage; i++) {
      const result = await suiClient.queryEvents({
        query: { 
          MoveEventType: `${PACKAGE_ID}::registry::RegistryCreated` 
        },
        cursor,
        limit: 50, // Fetch 50 events per page
      });

      allEvents = allEvents.concat(result.data);
      hasNextPage = result.hasNextPage;
      cursor = result.nextCursor;

      if (!hasNextPage) break;
    }

    // Find event where owner matches userAddress
    for (const event of allEvents) {
      const parsedJson = event.parsedJson as any;
      if (parsedJson?.owner === userAddress) {
        return parsedJson.registry_id;
      }
    }

    return null;
  } catch (error) {
    console.error('[Blockchain] Error finding registry:', error);
    return null;
  }
}

/**
 * Create a new FileRegistry for the user (sponsored transaction)
 * Returns the object ID of the created registry
 */
export async function createRegistry(masterKey: Uint8Array, appPrivateKey?: string): Promise<string> {
  if (!appPrivateKey) {
    throw new Error('App private key not configured. Set VITE_SUI_EXPORTED_PRIVATE_KEY environment variable.');
  }

  const userKeypair = deriveSuiKeypair(masterKey);
  
  // Decode the Sui private key (handles bech32 "suiprivkey1..." format)
  const { schema, secretKey } = decodeSuiPrivateKey(appPrivateKey);
  const appKeypair = Ed25519Keypair.fromSecretKey(secretKey);
  
  const tx = new Transaction();
  tx.setSender(userKeypair.toSuiAddress());
  tx.setGasOwner(appKeypair.toSuiAddress());
  
  tx.moveCall({
    target: `${PACKAGE_ID}::registry::create_registry`,
    arguments: [
      tx.pure.address(userKeypair.toSuiAddress()),
    ],
  });
  
  // Build and sign transaction with both keypairs
  const txBytes = await tx.build({ client: suiClient });
  const userSignature = (await userKeypair.signTransaction(txBytes)).signature;
  const appSignature = (await appKeypair.signTransaction(txBytes)).signature;
  
  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: [userSignature, appSignature],
    options: {
      showEffects: true,
      showObjectChanges: true,
    }
  });
  
  // Find the created FileRegistry object
  const createdObject = result.objectChanges?.find(
    (obj) => obj.type === 'created' && obj.objectType.includes('FileRegistry')
  );
  
  if (!createdObject || createdObject.type !== 'created') {
    throw new Error('Failed to create FileRegistry');
  }
  
  return createdObject.objectId;
}

/**
 * Register a file on the blockchain (sponsored transaction)
 */
export async function registerFile(
  masterKey: Uint8Array,
  registryId: string,
  fileId: string,
  blobId: string,
  encrypted: boolean,
  epochs: number,
  appPrivateKey: string
): Promise<void> {
  const userKeypair = deriveSuiKeypair(masterKey);
  const { secretKey } = decodeSuiPrivateKey(appPrivateKey);
  const appKeypair = Ed25519Keypair.fromSecretKey(secretKey);
  
  const tx = new Transaction();
  tx.setSender(userKeypair.toSuiAddress());
  tx.setGasOwner(appKeypair.toSuiAddress());
  
  tx.moveCall({
    target: `${PACKAGE_ID}::registry::register_file`,
    arguments: [
      tx.object(registryId),
      tx.pure.address(userKeypair.toSuiAddress()),
      tx.pure.vector('u8', Array.from(Buffer.from(fileId, 'hex'))),
      tx.pure.vector('u8', Array.from(Buffer.from(blobId))),
      tx.pure.bool(encrypted),
      tx.pure.u64(epochs)
    ]
  });
  
  // Build and sign transaction with both keypairs
  const txBytes = await tx.build({ client: suiClient });
  const userSignature = (await userKeypair.signTransaction(txBytes)).signature;
  const appSignature = (await appKeypair.signTransaction(txBytes)).signature;
  
  await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: [userSignature, appSignature],
    options: {
      showEffects: true,
    }
  });
}

/**
 * Get all files from a user's registry
 */
export async function getUserFiles(registryId: string): Promise<any[]> {
  const registry = await suiClient.getObject({
    id: registryId,
    options: { showContent: true }
  });
  
  if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
    return [];
  }
  
  const fields = registry.data.content.fields as any;
  const filesMap = fields?.files?.fields?.contents;
  
  // VecMap is stored as {contents: [{key: ..., value: ...}, ...]}
  if (!Array.isArray(filesMap)) {
    return [];
  }
  
  return filesMap.map((entry: any) => ({
    fileId: entry.fields?.key,
    metadata: entry.fields?.value?.fields
  }));
}

/**
 * Remove a file from the registry (sponsored transaction)
 */
export async function removeFile(
  masterKey: Uint8Array,
  registryId: string,
  fileId: string,
  appPrivateKey: string
): Promise<void> {
  const userKeypair = deriveSuiKeypair(masterKey);
  const appKeypair = Ed25519Keypair.fromSecretKey(appPrivateKey);
  
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::registry::remove_file`,
    arguments: [
      tx.object(registryId),
      tx.pure.vector('u8', Array.from(Buffer.from(fileId, 'hex')))
    ]
  });
  tx.setGasOwner(appKeypair.toSuiAddress());
  
  const userSignature = await tx.sign({ client: suiClient, signer: userKeypair });
  const appSignature = await tx.sign({ client: suiClient, signer: appKeypair });
  
  await suiClient.executeTransactionBlock({
    transactionBlock: userSignature.bytes,
    signature: [userSignature.signature, appSignature.signature]
  });
}
