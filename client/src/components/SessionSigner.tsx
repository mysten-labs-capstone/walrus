import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { normalizePrivateKey, isValidPrivateKey, maskPrivateKey } from '../auth/privateKey';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';

export default function SessionSigner() {
	const { privateKey, setPrivateKey, clearPrivateKey } = useAuth();
	const navigate = useNavigate();

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

	const handleLogout = () => {
		clearPrivateKey(); // Clear encryption key
		authService.logout(); // Clear username/password auth
		window.location.href = '/'; // Force full page reload to landing
	};

	return (
		<section className="space-y-4 rounded-2xl bg-white p-6 shadow-lg">
			<header className="flex items-center gap-3">
				<div>
					<h2 className="text-lg font-semibold text-gray-800">Session signer</h2>
					<p className="text-xs text-gray-500">Private key for file encryption (optional)</p>
				</div>
			</header>

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
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						{privateKey ? (
							<>
								<p className="text-sm font-semibold text-gray-800">Active key:</p>
								<p className="font-mono text-xs text-gray-500">{maskPrivateKey(privateKey)}</p>
							</>
						) : (
							<p className="text-sm text-gray-600">No encryption key set (files will not be encrypted)</p>
						)}
					</div>
					<div className="flex flex-wrap gap-3">
						<button
							onClick={() => {
								setEditing(true);
								setDraft(privateKey);
								setError(null);
							}}
							className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-100"
						>
							<Pencil className="h-4 w-4" /> {privateKey ? 'Change key' : 'Set key'}
						</button>

						<button
							onClick={handleLogout}
							className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
						>
							<LogOut className="h-4 w-4" /> Logout
						</button>
					</div>
				</div>
			)}
		</section>
	);
}