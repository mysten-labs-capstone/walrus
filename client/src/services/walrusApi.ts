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
	error?: string;
};

export async function verifyFile(file: File, privateKey: string): Promise<VerifyResponse> {
	const form = new FormData();
	form.append("file", file);
	form.append("privateKey", privateKey);

	const res = await fetch(apiUrl("/api/verify"), {
		method: "POST",
		body: form,
	});

	const data = (await res.json()) as VerifyResponse;
	return data;
}

export function uploadBlob(
	blob: Blob,
	privateKey: string,
	onProgress?: (pct: number) => void,
	signal?: AbortSignal,
	password?: string
): Promise<UploadResponse> {
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
			if (xhr.readyState !== XMLHttpRequest.DONE) return;

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
		form.append("file", blob, "encrypted.bin");
		form.append("privateKey", privateKey);
		if (password) {
			form.append("password", password);
		}

		xhr.send(form);
	});
}

export async function downloadBlob(blobId: string, privateKey: string, filename?: string, password?: string): Promise<Response> {
	const res = await fetch(apiUrl("/api/download"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			blobId: blobId.trim(),
			privateKey,
			filename: filename?.trim(),
			password: password?.trim(),
		}),
	});

	return res;
}

export async function storeFilePassword(
	blobId: string,
	password: string,
	filename?: string
): Promise<{ success: boolean; error?: string }> {
	try {
		const res = await fetch(apiUrl("/api/password/store"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				blobId: blobId.trim(),
				password,
				filename: filename?.trim(),
			}),
		});

		const data = await res.json();
		
		if (!res.ok) {
			return { success: false, error: data.error || "Failed to store password" };
		}

		return { success: true };
	} catch (err: any) {
		return { success: false, error: err.message || "Network error" };
	}
}

export async function verifyFilePassword(
	blobId: string,
	password: string
): Promise<{ isProtected: boolean; isValid: boolean; error?: string }> {
	try {
		const res = await fetch(apiUrl("/api/password/verify"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				blobId: blobId.trim(),
				password,
			}),
		});

		const data = await res.json();
		return {
			isProtected: data.isProtected || false,
			isValid: data.isValid || false,
			error: data.error,
		};
	} catch (err: any) {
		return {
			isProtected: false,
			isValid: false,
			error: err.message || "Network error",
		};
	}
}
