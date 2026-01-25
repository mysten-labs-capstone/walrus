import { useState, useCallback, useEffect } from 'react';
import { 
  Folder, FolderOpen, FolderPlus, ChevronRight, MoreVertical, 
  Pencil, Trash2, FileText, Lock, LockOpen, HardDrive, Calendar,
  Clock, Download, Share2, CalendarPlus, FolderInput, Info, Copy, Check,
  Upload, Loader2, AlertCircle, Home
} from 'lucide-react';
import { Button } from './ui/button';
import { apiUrl } from '../config/api';
import { authService } from '../services/authService';
import { useAuth } from '../auth/AuthContext';
import { downloadBlob, deleteBlob } from '../services/walrusApi';
import { decryptWalrusBlob } from '../services/decryptWalrusBlob';
import { removeCachedFile } from '../lib/fileCache';
import { ExtendDurationDialog } from './ExtendDurationDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { ShareDialog } from './ShareDialog';
import MoveFileDialog from './MoveFileDialog';
import CreateFolderDialog from './CreateFolderDialog';
import { deriveKEK, unwrapFileKey, exportFileKeyForShare } from '../services/fileKeyManagement';

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  fileCount: number;
  childCount: number;
  children: FolderNode[];
};

export type FileItem = {
  blobId: string;
  name: string;
  size: number;
  type: string;
  encrypted: boolean;
  uploadedAt: string;
  epochs?: number;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  s3Key?: string | null;
  folderId?: string | null;
  folderPath?: string | null;
  wrappedFileKey?: string | null;
};

interface FolderCardViewProps {
  files: FileItem[];
  currentFolderId: string | null;
  onFolderChange: (folderId: string | null) => void;
  onFileDeleted?: () => void;
  onUploadClick: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FolderCardView({ 
  files, 
  currentFolderId, 
  onFolderChange,
  onFileDeleted,
  onUploadClick
}: FolderCardViewProps) {
  const { privateKey } = useAuth();
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'My Files' }]);
  
  // File action states
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  
  // Dialogs
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{ blobId: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareFile, setShareFile] = useState<{ blobId: string; filename: string; wrappedFileKey: string | null; uploadedAt?: string; epochs?: number } | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [fileToMove, setFileToMove] = useState<{ blobId: string; name: string; currentFolderId?: string | null } | null>(null);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  
  // Folder editing
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');

  const fetchFolders = useCallback(async () => {
    const user = authService.getCurrentUser();
    if (!user?.id) return;

    try {
      const res = await fetch(apiUrl(`/api/folders?userId=${user.id}`));
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders);
      }
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Build folder path when current folder changes
  useEffect(() => {
    if (currentFolderId === null) {
      setFolderPath([{ id: null, name: 'My Files' }]);
      return;
    }

    // Find folder and build path
    const buildPath = (folderId: string, allFolders: FolderNode[]): { id: string | null; name: string }[] => {
      const findFolder = (id: string, folders: FolderNode[]): FolderNode | null => {
        for (const f of folders) {
          if (f.id === id) return f;
          const child = findFolder(id, f.children);
          if (child) return child;
        }
        return null;
      };

      const folder = findFolder(folderId, allFolders);
      if (!folder) return [{ id: null, name: 'My Files' }];

      const path: { id: string | null; name: string }[] = [{ id: null, name: 'My Files' }];
      
      // Build path by traversing up
      const buildParentPath = (f: FolderNode, allFolders: FolderNode[]): string[] => {
        if (!f.parentId) return [f.name];
        const parent = findFolder(f.parentId, allFolders);
        if (!parent) return [f.name];
        return [...buildParentPath(parent, allFolders), f.name];
      };

      const names = buildParentPath(folder, allFolders);
      let currentId: string | null = null;
      
      // Re-find IDs for each path segment
      const findIdByPath = (pathNames: string[], folders: FolderNode[], parentId: string | null): { id: string | null; name: string }[] => {
        const result: { id: string | null; name: string }[] = [];
        let currentParent = parentId;
        
        for (const name of pathNames) {
          const findInLevel = (folders: FolderNode[], parent: string | null): FolderNode | null => {
            for (const f of folders) {
              if (f.name === name && f.parentId === parent) return f;
              const child = findInLevel(f.children, parent);
              if (child) return child;
            }
            return null;
          };
          
          const found = findInLevel(folders, currentParent);
          if (found) {
            result.push({ id: found.id, name: found.name });
            currentParent = found.id;
          }
        }
        return result;
      };

      return [{ id: null, name: 'My Files' }, ...findIdByPath(names, allFolders, null)];
    };

    setFolderPath(buildPath(currentFolderId, folders));
  }, [currentFolderId, folders]);

  // Get folders at current level
  const currentLevelFolders = currentFolderId === null
    ? folders.filter(f => f.parentId === null)
    : folders.flatMap(f => {
        const findChildren = (folder: FolderNode): FolderNode[] => {
          if (folder.id === currentFolderId) return folder.children;
          return folder.children.flatMap(findChildren);
        };
        return findChildren(f);
      });

  // Get files at current level
  const currentLevelFiles = files.filter(f => f.folderId === currentFolderId);

  const handleFolderClick = (folderId: string) => {
    onFolderChange(folderId);
  };

  const handleShare = useCallback(async (blobId: string, filename: string) => {
    try {
      const user = authService.getCurrentUser();
      if (!user?.id) {
        alert('You must be logged in to share files');
        return;
      }

      const response = await fetch(apiUrl(`/api/files/${blobId}?userId=${user.id}`));
      if (!response.ok) {
        throw new Error('Failed to fetch file metadata');
      }

      const fileData = await response.json();
      
      if (fileData.status && (fileData.status === 'processing' || fileData.status === 'pending')) {
        setShareError('This file is still being uploaded to Walrus. Please wait until the upload is complete before sharing.');
        setTimeout(() => setShareError(null), 5000);
        return;
      }
      
      if (fileData.status === 'failed') {
        setShareError('This file has failed to upload to Walrus. Please wait for server to retry before sharing.');
        setTimeout(() => setShareError(null), 5000);
        return;
      }

      setShareFile({
        blobId,
        filename,
        wrappedFileKey: fileData.wrappedFileKey,
        uploadedAt: fileData.uploadedAt,
        epochs: fileData.epochs,
      });
      setShareDialogOpen(true);
    } catch (err: any) {
      console.error('[handleShare] Error:', err);
      setShareError(err.message || 'Failed to prepare file for sharing');
      setTimeout(() => setShareError(null), 5000);
    }
  }, []);

  const copyBlobId = useCallback((blobId: string) => {
    navigator.clipboard.writeText(blobId);
    setCopiedId(blobId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleDelete = useCallback((blobId: string, fileName: string) => {
    setFileToDelete({ blobId, name: fileName });
    setDeleteDialogOpen(true);
    setDeleteError(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!fileToDelete) return;

    setDeletingId(fileToDelete.blobId);
    setDeleteError(null);
    try {
      const user = authService.getCurrentUser();
      if (!user?.id) {
        setDeleteError('You must be logged in to delete files');
        return;
      }

      const res = await deleteBlob(fileToDelete.blobId, user.id);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }

      removeCachedFile(fileToDelete.blobId);
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      onFileDeleted?.();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete file');
    } finally {
      setDeletingId(null);
    }
  }, [fileToDelete, onFileDeleted]);

  const downloadFile = useCallback(async (blobId: string, name?: string, encrypted?: boolean) => {
    setDownloadingId(blobId);
    try {
      const user = authService.getCurrentUser();
      
      let wrappedFileKey: string | undefined;
      if (encrypted && user?.id) {
        try {
          const metadataRes = await fetch(apiUrl(`/api/files/${blobId}?userId=${user.id}`));
          if (metadataRes.ok) {
            const metadata = await metadataRes.json();
            wrappedFileKey = metadata.wrappedFileKey;
          }
        } catch (err) {
          console.warn('[downloadFile] Failed to fetch wrappedFileKey:', err);
        }
      }
      
      const res = await downloadBlob(blobId, privateKey || '', name, user?.id);
      if (!res.ok) {
        let detail = 'Download failed';
        try {
          const payload = await res.json();
          detail = payload?.error ?? detail;
        } catch {}
        setDownloadError(detail);
        setTimeout(() => setDownloadError(null), 5000);
        return;
      }

      const blob = await res.blob();

      if (encrypted && privateKey) {
        const baseName = (name?.trim() || blobId).replace(/\.[^.]*$/, '');
        const result = await decryptWalrusBlob(blob, privateKey, baseName, wrappedFileKey);

        if (result) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(result.blob);
          a.download = result.suggestedName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(a.href);
          return;
        } else {
          setDownloadError('Decryption failed: The file could not be decrypted with your key.');
          setTimeout(() => setDownloadError(null), 5000);
          return;
        }
      }

      if (!encrypted && privateKey && blob.size > 0) {
        const baseName = (name?.trim() || blobId).replace(/\.[^.]*$/, '');
        const result = await decryptWalrusBlob(blob, privateKey, baseName, wrappedFileKey);
        
        if (result) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(result.blob);
          a.download = result.suggestedName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(a.href);
          return;
        }
      }

      const filename = name?.trim() || blobId;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloadingId(null);
    }
  }, [privateKey]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const calculateExpiryInfo = (uploadedAt: string, epochs: number = 3) => {
    const uploadDate = new Date(uploadedAt);
    const daysPerEpoch = 14;
    const totalDays = epochs * daysPerEpoch;
    const expiryDate = new Date(uploadDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    
    return {
      expiryDate,
      daysRemaining: Math.max(0, daysRemaining),
      totalDays,
      isExpired: daysRemaining <= 0,
    };
  };

  const handleRenameFolder = async (folderId: string) => {
    const user = authService.getCurrentUser();
    if (!user?.id || !editingFolderName.trim()) return;

    try {
      const res = await fetch(apiUrl(`/api/folders/${folderId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, name: editingFolderName.trim() })
      });

      if (res.ok) {
        fetchFolders();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to rename folder');
      }
    } catch (err) {
      console.error('Failed to rename folder:', err);
    } finally {
      setEditingFolderId(null);
      setEditingFolderName('');
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    const user = authService.getCurrentUser();
    if (!user?.id) return;

    if (!confirm('Delete this folder? Files inside will be moved to the root.')) return;

    try {
      const res = await fetch(apiUrl(`/api/folders/${folderId}?userId=${user.id}`), {
        method: 'DELETE'
      });

      if (res.ok) {
        if (currentFolderId === folderId) {
          onFolderChange(null);
        }
        fetchFolders();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete folder');
      }
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  };

  const isEmpty = currentLevelFolders.length === 0 && currentLevelFiles.length === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm">
        {folderPath.map((item, index) => (
          <div key={item.id ?? 'root'} className="flex items-center gap-2">
            {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}
            <button
              onClick={() => onFolderChange(item.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
                index === folderPath.length - 1
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium'
                  : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              {index === 0 && <Home className="h-4 w-4" />}
              {index > 0 && <Folder className="h-4 w-4" />}
              {item.name}
            </button>
          </div>
        ))}
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setCreateFolderParentId(currentFolderId);
              setCreateFolderDialogOpen(true);
            }}
            variant="outline"
            className="flex items-center gap-2"
          >
            <FolderPlus className="h-4 w-4" />
            New Folder
          </Button>
        </div>
        <Button
          size="sm"
          onClick={onUploadClick}
          className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
        >
          <Upload className="h-4 w-4" />
          Upload Files
        </Button>
      </div>

      {/* Empty State */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/30 dark:to-cyan-900/30">
            {currentFolderId === null ? (
              <HardDrive className="h-12 w-12 text-blue-600 dark:text-blue-400" />
            ) : (
              <FolderOpen className="h-12 w-12 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {currentFolderId === null ? 'Welcome to your file storage!' : 'This folder is empty'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
            {currentFolderId === null 
              ? 'Get started by creating your first folder or uploading files to organize your data securely on Walrus.'
              : 'Add files or create subfolders to organize your content.'}
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => {
                setCreateFolderParentId(currentFolderId);
                setCreateFolderDialogOpen(true);
              }}
              variant="outline"
              className="flex items-center gap-2"
            >
              <FolderPlus className="h-4 w-4" />
              Create Folder
            </Button>
            <Button
              onClick={onUploadClick}
              className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
            >
              <Upload className="h-4 w-4" />
              Upload First File
            </Button>
          </div>
        </div>
      )}

      {/* Folders Grid */}
      {currentLevelFolders.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Folders</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {currentLevelFolders.map((folder) => (
              <div
                key={folder.id}
                className="group relative rounded-xl border border-blue-200/50 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 cursor-pointer"
                onClick={() => handleFolderClick(folder.id)}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/40 dark:to-cyan-900/40">
                    <Folder 
                      className="h-8 w-8" 
                      style={{ color: folder.color || '#3b82f6' }}
                    />
                  </div>
                  
                  {editingFolderId === folder.id ? (
                    <input
                      type="text"
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      onBlur={() => handleRenameFolder(folder.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameFolder(folder.id);
                        if (e.key === 'Escape') {
                          setEditingFolderId(null);
                          setEditingFolderName('');
                        }
                      }}
                      className="w-full bg-transparent border-b border-blue-400 outline-none text-sm text-center"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate w-full">
                      {folder.name}
                    </p>
                  )}
                  
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {folder.fileCount} file{folder.fileCount !== 1 ? 's' : ''}
                    {folder.childCount > 0 && `, ${folder.childCount} folder${folder.childCount !== 1 ? 's' : ''}`}
                  </p>
                </div>

                {/* Folder menu button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenFolderMenuId(openFolderMenuId === folder.id ? null : folder.id);
                  }}
                  className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-all"
                >
                  <MoreVertical className="h-4 w-4 text-gray-500" />
                </button>

                {/* Folder dropdown menu */}
                {openFolderMenuId === folder.id && (
                  <div 
                    className="absolute right-2 top-10 z-50 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 py-1 min-w-[140px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
                      onClick={() => {
                        setEditingFolderId(folder.id);
                        setEditingFolderName(folder.name);
                        setOpenFolderMenuId(null);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      Rename
                    </button>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
                      onClick={() => {
                        setCreateFolderParentId(folder.id);
                        setCreateFolderDialogOpen(true);
                        setOpenFolderMenuId(null);
                      }}
                    >
                      <FolderPlus className="h-4 w-4" />
                      New Subfolder
                    </button>
                    <hr className="my-1 border-gray-200 dark:border-slate-700" />
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-left"
                      onClick={() => {
                        handleDeleteFolder(folder.id);
                        setOpenFolderMenuId(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files Grid */}
      {currentLevelFiles.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Files</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentLevelFiles.map((f) => {
              const expiry = calculateExpiryInfo(f.uploadedAt, f.epochs);
              
              return (
                <div
                  key={f.blobId}
                  className="group relative rounded-xl border border-blue-200/50 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-100 to-blue-100 dark:from-cyan-900/40 dark:to-blue-900/40">
                      <FileText className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {f.name}
                        </p>
                        {f.encrypted && (
                          <Lock className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        )}
                      </div>
                      
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{formatBytes(f.size)}</span>
                        <span>•</span>
                        <span>{formatDate(f.uploadedAt)}</span>
                        <span>•</span>
                        <span className={expiry.isExpired ? 'text-red-500' : expiry.daysRemaining < 30 ? 'text-orange-500' : ''}>
                          {expiry.isExpired ? 'Expired' : `${expiry.daysRemaining}d left`}
                        </span>
                      </div>

                      {/* Status badge */}
                      <div className="mt-2">
                        {f.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            <HardDrive className="h-3 w-3" />
                            Walrus
                          </span>
                        ) : f.status === 'processing' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Processing
                          </span>
                        ) : f.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            <AlertCircle className="h-3 w-3" />
                            Failed
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* File menu button */}
                    <button
                      onClick={() => setOpenMenuId(openMenuId === f.blobId ? null : f.blobId)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <MoreVertical className="h-4 w-4 text-gray-500" />
                    </button>

                    {/* File dropdown menu */}
                    {openMenuId === f.blobId && (
                      <div className="absolute right-4 top-14 z-50 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 py-1 min-w-[160px]">
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
                          onClick={() => {
                            downloadFile(f.blobId, f.name, f.encrypted);
                            setOpenMenuId(null);
                          }}
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
                          onClick={() => {
                            handleShare(f.blobId, f.name);
                            setOpenMenuId(null);
                          }}
                        >
                          <Share2 className="h-4 w-4" />
                          Share
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
                          onClick={() => {
                            setSelectedFile(f);
                            setExtendDialogOpen(true);
                            setOpenMenuId(null);
                          }}
                        >
                          <CalendarPlus className="h-4 w-4" />
                          Extend Duration
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
                          onClick={() => {
                            setFileToMove({ blobId: f.blobId, name: f.name, currentFolderId: f.folderId });
                            setMoveDialogOpen(true);
                            setOpenMenuId(null);
                          }}
                        >
                          <FolderInput className="h-4 w-4" />
                          Move to Folder
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
                          onClick={() => {
                            copyBlobId(f.blobId);
                            setOpenMenuId(null);
                          }}
                        >
                          {copiedId === f.blobId ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                          Copy Blob ID
                        </button>
                        <hr className="my-1 border-gray-200 dark:border-slate-700" />
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-left"
                          onClick={() => {
                            handleDelete(f.blobId, f.name);
                            setOpenMenuId(null);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Quick action buttons */}
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => downloadFile(f.blobId, f.name, f.encrypted)}
                      disabled={downloadingId === f.blobId}
                      className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-xs"
                    >
                      {downloadingId === f.blobId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleShare(f.blobId, f.name)}
                      className="bg-green-50 hover:bg-green-100 text-green-700 border-green-300 dark:bg-green-900/20 dark:hover:bg-green-900/30 dark:text-green-400 dark:border-green-700"
                    >
                      <Share2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CreateFolderDialog
        open={createFolderDialogOpen}
        onClose={() => setCreateFolderDialogOpen(false)}
        parentId={createFolderParentId}
        onFolderCreated={() => fetchFolders()}
      />

      {shareFile && (
        <ShareDialog
          open={shareDialogOpen}
          onClose={() => {
            setShareDialogOpen(false);
            setShareFile(null);
          }}
          blobId={shareFile.blobId}
          filename={shareFile.filename}
          wrappedFileKey={shareFile.wrappedFileKey}
          uploadedAt={shareFile.uploadedAt}
          epochs={shareFile.epochs}
        />
      )}

      {selectedFile && (
        <ExtendDurationDialog
          open={extendDialogOpen}
          onOpenChange={setExtendDialogOpen}
          blobId={selectedFile.blobId}
          fileName={selectedFile.name}
          fileSize={selectedFile.size}
          currentEpochs={selectedFile.epochs}
          onSuccess={() => onFileDeleted?.()}
        />
      )}

      {fileToDelete && (
        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open);
            if (!open) {
              setFileToDelete(null);
              setDeleteError(null);
            }
          }}
          fileName={fileToDelete.name}
          onConfirm={confirmDelete}
        />
      )}

      {fileToMove && (
        <MoveFileDialog
          open={moveDialogOpen}
          onClose={() => {
            setMoveDialogOpen(false);
            setFileToMove(null);
          }}
          files={[fileToMove]}
          onFileMoved={() => onFileDeleted?.()}
        />
      )}

      {/* Error notifications */}
      {downloadError && (
        <div className="fixed bottom-4 right-4 max-w-md rounded-lg border border-red-200 bg-red-50 p-4 shadow-lg dark:border-red-900 dark:bg-red-900/20 animate-fade-in z-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900 dark:text-red-100">Download Failed</p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{downloadError}</p>
            </div>
          </div>
        </div>
      )}

      {shareError && (
        <div className="fixed bottom-4 right-4 max-w-md rounded-lg border border-orange-200 bg-orange-50 p-4 shadow-lg dark:border-orange-900 dark:bg-orange-900/20 animate-fade-in z-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">Share Not Available</p>
              <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">{shareError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Click outside handlers */}
      {(openMenuId || openFolderMenuId) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setOpenMenuId(null);
            setOpenFolderMenuId(null);
          }}
        />
      )}
    </div>
  );
}
