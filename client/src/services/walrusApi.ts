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

export async function verifyFile(file: File, _privateKey?: string): Promise<VerifyResponse> {
	const form = new FormData();
	form.append("file", file);

	const res = await fetch(apiUrl("/api/verify"), {
		method: "POST",
		body: form,
	});

	const data = (await res.json()) as VerifyResponse;
	return data;
}

export function uploadBlob(
	blob: Blob,
	_privateKey?: string,
	onProgress?: (pct: number) => void,
	signal?: AbortSignal
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
		form.append("file", blob, "file.bin");

		xhr.send(form);
	});
}

export async function downloadBlob(blobId: string, _privateKey?: string, filename?: string): Promise<Response> {
	const res = await fetch(apiUrl("/api/download"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			blobId: blobId.trim(),
			filename: filename?.trim(),
		}),
	});

	return res;
}
