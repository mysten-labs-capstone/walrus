import { apiUrl } from "../config/api";

export type VerifyResponse = {
	isValid: boolean;
	errors: string[];
	warnings: string[];
	fileInfo: {
		name: string;
		size: number;
		type: string;
	};
	message?: string;
};

export type UploadResponse = {
	blobId?: string;
	fileId?: string;
	s3Key?: string;
	status?: string;
	uploadMode?: string;
	error?: string;
};

export async function verifyFile(file: File, _privateKey?: string): Promise<VerifyResponse> {
	// Client-side validation only 
	const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
	const errors: string[] = [];
	const warnings: string[] = [];

	if (file.size === 0) {
		errors.push("File is empty");
	}
	if (file.size > MAX_FILE_SIZE) {
		errors.push(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
	}

	return {
		isValid: errors.length === 0,
		errors,
		warnings,
		fileInfo: {
			name: file.name,
			size: file.size,
			type: file.type || "application/octet-stream",
		},
		message: "Client-side validation",
	};
}

/**
 * Upload large files via presigned S3 URL to bypass Vercel's body size limit
 */
async function uploadBlobViaPresignedUrl(
	blob: Blob,
	privateKey?: string,
	onProgress?: (pct: number) => void,
	signal?: AbortSignal,
	userId?: string,
	filename?: string,
	paymentAmount?: number,
	clientSideEncrypted?: boolean,
	epochs?: number
): Promise<UploadResponse> {
	if (!userId) {
		throw new Error("userId is required for presigned URL upload");
	}

	// Step 1: Get presigned URL from server
	console.log("[uploadBlobViaPresignedUrl] Requesting presigned URL...");
	const presignedRes = await fetch(apiUrl("/api/upload/presigned-url"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			userId,
			filename: filename || "file.bin",
			fileSize: blob.size,
			contentType: blob.type || "application/octet-stream",
			encrypted: clientSideEncrypted || false,
			epochs: epochs || 3,
			paymentAmount,
		}),
	});

	if (!presignedRes.ok) {
		const errorData = await presignedRes.json();
		throw new Error(errorData.error || "Failed to get presigned URL");
	}

	const { presignedUrl, fileId, tempBlobId } = await presignedRes.json();
	console.log("[uploadBlobViaPresignedUrl] Got presigned URL, uploading to S3...");

	// Step 2: Upload directly to S3 using presigned URL
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", presignedUrl);
		xhr.setRequestHeader("Content-Type", blob.type || "application/octet-stream");

		// Abort support
		if (signal) {
			const abortHandler = () => {
				try {
					xhr.abort();
				} catch {}
				reject(new DOMException("Aborted", "AbortError"));
			};
			if (signal.aborted) return abortHandler();
			signal.addEventListener("abort", abortHandler, { once: true });
		}

		// Progress tracking
		xhr.upload.onprogress = (evt) => {
			if (!evt.lengthComputable) return;
			const pct = Math.floor((evt.loaded / evt.total) * 100);
			onProgress?.(pct);
		};

		xhr.onreadystatechange = () => {
			if (xhr.readyState !== 4) return;

			if (xhr.status >= 200 && xhr.status < 300) {
				console.log("[uploadBlobViaPresignedUrl] S3 upload complete!");
				resolve({
					blobId: tempBlobId,
					fileId,
					status: "pending",
					uploadMode: "async",
				});
			} else {
				reject(new Error(`S3 upload failed with status ${xhr.status}`));
			}
		};

		xhr.onerror = () => {
			reject(new Error("S3 upload failed"));
		};

		// Send the blob directly (not FormData for presigned URL)
		xhr.send(blob);
	});
}

export function uploadBlob(
	blob: Blob,
	privateKey?: string,
	onProgress?: (pct: number) => void,
	signal?: AbortSignal,
	userId?: string,
	encryptOnServer?: boolean,
	filename?: string,
	paymentAmount?: number,
	clientSideEncrypted?: boolean,
	epochs?: number,
	uploadMode?: "sync" | "async" // NEW: async = fast S3 upload, sync = wait for Walrus
): Promise<UploadResponse> {
	const VERCEL_BODY_LIMIT = 4 * 1024 * 1024; // 4MB - use presigned URLs for larger files
	
	// For large files, use presigned URL upload to bypass Vercel's body size limit
	if (blob.size > VERCEL_BODY_LIMIT) {
		console.log(`[uploadBlob] File size ${blob.size} exceeds Vercel limit, using presigned URL upload`);
		return uploadBlobViaPresignedUrl(
			blob,
			privateKey,
			onProgress,
			signal,
			userId,
			filename,
			paymentAmount,
			clientSideEncrypted,
			epochs
		);
	}
	
	// For smaller files, use traditional FormData upload
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", apiUrl("/api/upload"));

		// Abort support
		if (signal) {
			const abortHandler = () => {
				try {
					xhr.abort();
				} catch {}
				reject(new DOMException("Aborted", "AbortError"));
			};
			if (signal.aborted) return abortHandler();
			signal.addEventListener("abort", abortHandler, { once: true });
		}

		// Progress tracking
		xhr.upload.onprogress = (evt) => {
			if (!evt.lengthComputable) return;
			const pct = Math.floor((evt.loaded / evt.total) * 100);
			onProgress?.(pct);
		};

		xhr.onreadystatechange = () => {
			// Some test environments mock `XMLHttpRequest` without the static
			// DONE property. Use the numeric value 4 (DONE) to be robust in
			// both browser and test mocks.
			if (xhr.readyState !== 4) return;

			const text = xhr.responseText || "";
			let payload: UploadResponse | null = null;

			try {
				payload = JSON.parse(text) as UploadResponse;
			} catch {}

			if (xhr.status >= 200 && xhr.status < 300) {
				if (payload?.blobId) return resolve(payload);
				return reject(new Error("Upload succeeded but no blobId was returned."));
			}

			return reject(new Error(payload?.error || text || "Upload failed"));
		};

		const form = new FormData();
		form.append("file", blob, filename || "file.bin");
		
		// Add userId and encryption params if provided
		if (userId) form.append("userId", userId);
		if (privateKey) form.append("userPrivateKey", privateKey);
		if (encryptOnServer !== undefined) form.append("encryptOnServer", String(encryptOnServer));
		if (paymentAmount !== undefined) form.append("paymentAmount", String(paymentAmount));
		if (clientSideEncrypted !== undefined) form.append("clientSideEncrypted", String(clientSideEncrypted));
		if (epochs !== undefined) form.append("epochs", String(epochs));
		if (uploadMode !== undefined) form.append("uploadMode", uploadMode);

		xhr.send(form);
	});
}

export async function downloadBlob(
	blobId: string, 
	privateKey?: string, 
	filename?: string,
	userId?: string,
	decryptOnServer?: boolean
): Promise<Response> {
	const res = await fetch(apiUrl("/api/download"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			blobId: blobId.trim(),
			filename: filename?.trim(),
			userId,
			userPrivateKey: privateKey,
			decryptOnServer,
		}),
	});

	return res;
}

export async function deleteBlob(
	blobId: string,
	userId: string
): Promise<Response> {
	const res = await fetch(apiUrl("/api/delete"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			blobId: blobId.trim(),
			userId,
		}),
	});

	return res;
}

