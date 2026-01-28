import { useState, useEffect, useCallback } from 'react';
import { FolderInput, Folder, FolderOpen, ChevronRight, ChevronDown, Home, X, Loader2, FolderPlus } from 'lucide-react';
import { Button } from './ui/button';
import { apiUrl } from '../config/api';
import { authService } from '../services/authService';
import type { FolderNode } from './FolderTree';
import CreateFolderDialog from './CreateFolderDialog';

interface MoveFileDialogProps {
  open: boolean;
  onClose: () => void;
  files: { blobId: string; name: string; currentFolderId?: string | null }[];
  onFileMoved: () => void;
  onCreateFolder?: (parentId: string | null) => void;
}

export default function MoveFileDialog({
  open,
  onClose,
  files,
  onFileMoved,
  onCreateFolder
}: MoveFileDialogProps) {
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);

  const fetchFolders = useCallback(async () => {
    const user = authService.getCurrentUser();
    if (!user?.id) return;

    setLoading(true);
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
    if (open) {
      fetchFolders();
      // Pre-select current folder if all files are in the same folder
      const currentFolders = new Set(files.map(f => f.currentFolderId));
      if (currentFolders.size === 1) {
        setSelectedFolderId(files[0].currentFolderId || null);
      } else {
        setSelectedFolderId(null);
      }
    }
  }, [open, fetchFolders, files]);

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleMove = async () => {
    const user = authService.getCurrentUser();
    if (!user?.id) return;

    setMoving(true);
    setError(null);

    try {
      const res = await fetch(apiUrl('/api/files/move'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          blobIds: files.map(f => f.blobId),
          folderId: selectedFolderId
        })
      });

      if (res.ok) {
        onFileMoved();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to move files');
      }
    } catch (err) {
      console.error('Failed to move files:', err);
      setError('Failed to move files');
    } finally {
      setMoving(false);
    }
  };

  const renderFolder = (folder: FolderNode, depth: number = 0) => {
    const isExpanded = expandedIds.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const hasChildren = folder.children.length > 0;
    const FolderIcon = isExpanded ? FolderOpen : Folder;

    // Check if this folder contains any of the files being moved
    const containsFile = files.some(f => f.currentFolderId === folder.id);

    return (
      <div key={folder.id}>
        <div
          className={`
            flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors
            ${isSelected 
              ? 'bg-emerald-900/40 text-emerald-300' 
              : 'hover:bg-zinc-800 text-gray-300'
            }
            ${containsFile ? 'opacity-50' : ''}
          `}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => !containsFile && setSelectedFolderId(folder.id)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => toggleExpand(folder.id, e)}
              className="p-0.5 hover:bg-zinc-700 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-gray-400" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-400" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <FolderIcon 
            className="h-4 w-4 shrink-0" 
            style={{ color: folder.color || '#60a5fa' }}
          />

          <span className="flex-1 text-sm truncate">{folder.name}</span>

          {containsFile && (
            <span className="text-xs text-gray-400">(current)</span>
          )}
        </div>

        {isExpanded && hasChildren && (
          <div>
            {folder.children.map(child => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!open) return null;

  const fileNames = files.length === 1 
    ? files[0].name 
    : `${files.length} files`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-zinc-900 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden max-h-[80vh] flex flex-col border border-zinc-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-900/30 rounded-lg">
              <FolderInput className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Move to Folder
              </h2>
              <p className="text-sm text-gray-300 truncate max-w-[250px]">
                {fileNames}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-300" />
          </button>
        </div>

        {/* Folder Selection */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
            </div>
          ) : (
            <div className="space-y-1">
              {/* Root option */}
              <div
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors
                  ${selectedFolderId === null 
                    ? 'bg-emerald-900/40 text-emerald-300' 
                    : 'hover:bg-zinc-800 text-gray-300'
                  }
                `}
                onClick={() => setSelectedFolderId(null)}
              >
                <Home className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium">Root (No Folder)</span>
              </div>

              {/* Folder tree */}
              {folders.map(folder => renderFolder(folder))}

              {folders.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-300 mb-3">No folders created yet</p>
                  {onCreateFolder && (
                    <button
                      onClick={() => {
                        setCreateFolderParentId(null);
                        setCreateFolderDialogOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/20 rounded-md transition-colors"
                    >
                      <FolderPlus className="h-4 w-4" />
                      Create New Folder
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 space-y-3">
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-zinc-700 text-white hover:bg-zinc-800"
              disabled={moving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMove}
              className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
              disabled={moving || loading}
            >
              {moving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Moving...
                </>
              ) : (
                'Move Here'
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Create Folder Dialog */}
      {onCreateFolder && (
        <CreateFolderDialog
          open={createFolderDialogOpen}
          onClose={() => setCreateFolderDialogOpen(false)}
          parentId={createFolderParentId}
          onFolderCreated={() => {
            fetchFolders();
            onCreateFolder(createFolderParentId);
          }}
        />
      )}
    </div>
  );
}
