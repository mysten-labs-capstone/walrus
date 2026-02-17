/**
 * Walrus upload: Upload Relay (primary) with direct writeBlob as fallback.
 * Relay uses one HTTP POST to the relay; direct path uses ~2200 requests to storage nodes.
 */

export type UploadResult = { blobId: string; blobObjectId: string | null };

/**
 * Single attempt: upload via Walrus Upload Relay (writeBlobFlow).
 * Requires walrusClient to be configured with uploadRelayUrl.
 * Throws on any failure (relay unavailable, tip required, network, etc.).
 */
export async function writeViaRelay(
  walrusClient: any,
  suiClient: any,
  signer: any,
  blobData: Uint8Array,
  epochs: number,
  uploadTimeoutMs: number = 120_000,
): Promise<UploadResult> {
  const run = async (): Promise<UploadResult> => {
    const flow = walrusClient.writeBlobFlow({ blob: blobData });

    await flow.encode();

    const owner = signer.toSuiAddress();
    const registerTx = flow.register({
      epochs,
      deletable: true,
      owner,
    });

    const registerResult = await suiClient.signAndExecuteTransaction({
      signer,
      transaction: registerTx,
      options: { showEffects: true },
    });

    const digest = registerResult.digest;
    if (!digest) {
      throw new Error("Register transaction did not return digest");
    }

    await flow.upload({ digest });

    const certifyTx = flow.certify();
    await suiClient.signAndExecuteTransaction({
      signer,
      transaction: certifyTx,
      options: { showEffects: true },
    });

    const blobInfo = await flow.getBlob();
    const rawId = blobInfo?.blobObject?.id;
    const blobObjectId =
      typeof rawId === "string" ? rawId : (rawId as { id?: string })?.id ?? null;

    return {
      blobId: blobInfo.blobId,
      blobObjectId,
    };
  };

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(`Walrus relay upload timeout after ${uploadTimeoutMs}ms`),
        ),
      uploadTimeoutMs,
    ),
  );

  return Promise.race([run(), timeoutPromise]);
}