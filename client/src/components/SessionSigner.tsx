import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { normalizePrivateKey, isValidPrivateKey, maskPrivateKey } from '../auth/privateKey';

export default function SessionSigner() {
	const { privateKey, setPrivateKey, clearPrivateKey } = useAuth();

	const [editing, setEditing] = useState<boolean>(() => !privateKey);
	const [draft, setDraft] = useState<string>(privateKey);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setDraft(privateKey);
		setError(null);
		setEditing(false);
	}, [privateKey]);

	const onSubmit = useCallback(
		(e: FormEvent) => {
			e.preventDefault();
			const norm = normalizePrivateKey(draft);
			if (!norm) return setError('Private key is required.');
			if (!isValidPrivateKey(norm)) return setError('Expected a 32-byte hex private key (0x...).');
			setError(null);
			setPrivateKey(norm);
			setEditing(false);
		},
		[draft, setPrivateKey]
	);

	return (
		<div className="relative">
			{editing ? (
				<form onSubmit={onSubmit} className="flex items-center gap-2">
					<input
						type="password"
						value={draft}
						onChange={(e) => {
							setDraft(e.target.value);
							setError(null);
						}}
						placeholder="0x..."
						className="w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
						autoComplete="off"
						spellCheck={false}
					/>
					<button type="submit" className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:from-cyan-700 hover:to-blue-700">
						Save
					</button>
					<button
						type="button"
						onClick={() => {
							setDraft(privateKey);
							setError(null);
							setEditing(false);
						}}
						className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
					>
						Cancel
					</button>
					{error && <p className="absolute top-full mt-1 text-xs text-red-600 whitespace-nowrap">{error}</p>}
				</form>
			) : (
				<div className="flex items-center gap-2">
					<div className="text-right">
						<p className="text-xs font-medium text-gray-700 dark:text-gray-300">Active key:</p>
						<p className="font-mono text-xs text-gray-500 dark:text-gray-400">{maskPrivateKey(privateKey)}</p>
					</div>
					<button
						onClick={() => {
							setEditing(true);
							setDraft(privateKey);
							setError(null);
						}}
						className="flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400"
					>
						<Pencil className="h-3 w-3" /> Change key
					</button>
					<button
						onClick={() => {
							setEditing(false);
							setDraft('');
							setError(null);
							clearPrivateKey();
						}}
						className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
					>
						<LogOut className="h-3 w-3" /> Sign out
					</button>
				</div>
			)}
		</div>
	);
}