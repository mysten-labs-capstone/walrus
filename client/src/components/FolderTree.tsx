import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderOpen, FolderPlus, ChevronRight, ChevronDown, MoreHorizontal, Pencil, Trash2, Home, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { apiUrl } from '../config/api';
import { authService } from '../services/authService';

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  fileCount: number;
  childCount: number;
  children: FolderNode[];
};

interface FolderTreeProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onRefresh?: () => void;
  onUploadClick?: () => void;
}

export default function FolderTree({ 
  selectedFolderId, 
  onSelectFolder, 
  onCreateFolder,
  onRefresh,
  onUploadClick
}: FolderTreeProps) {
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ folderId: string; x: number; y: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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

  // Allow parent to trigger refresh
  useEffect(() => {
    if (onRefresh) {
      fetchFolders();
    }
  }, [onRefresh, fetchFolders]);

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

  const handleRename = async (folderId: string) => {
    const user = authService.getCurrentUser();
    if (!user?.id || !editingName.trim()) return;

    try {
      const res = await fetch(apiUrl(`/api/folders/${folderId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, name: editingName.trim() })
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
      setEditingId(null);
      setEditingName('');
    }
  };

  const handleDelete = async (folderId: string) => {
    const user = authService.getCurrentUser();
    if (!user?.id) return;

    if (!confirm('Delete this folder? Files inside will be moved to the root.')) return;

    try {
      const res = await fetch(apiUrl(`/api/folders/${folderId}?userId=${user.id}`), {
        method: 'DELETE'
      });

      if (res.ok) {
        if (selectedFolderId === folderId) {
          onSelectFolder(null);
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

  const renderFolder = (folder: FolderNode, depth: number = 0) => {
    const isExpanded = expandedIds.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const hasChildren = folder.children.length > 0;
    const FolderIcon = isExpanded ? FolderOpen : Folder;

    return (
      <div key={folder.id}>
        <div
          className={`
            group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors
            ${isSelected 
              ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100' 
              : 'hover:bg-gray-100 dark:hover:bg-slate-800'
            }
          `}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onSelectFolder(folder.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY });
          }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => toggleExpand(folder.id, e)}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-slate-700 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-gray-500" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-500" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <FolderIcon 
            className="h-4 w-4 shrink-0" 
            style={{ color: folder.color || '#60a5fa' }}
          />

          {editingId === folder.id ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => handleRename(folder.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(folder.id);
                if (e.key === 'Escape') {
                  setEditingId(null);
                  setEditingName('');
                }
              }}
              className="flex-1 bg-transparent border-b border-blue-400 outline-none text-sm px-1"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 text-sm truncate">{folder.name}</span>
          )}

          {folder.fileCount > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {folder.fileCount}
            </span>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY });
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded transition-opacity"
          >
            <MoreHorizontal className="h-3 w-3 text-gray-500" />
          </button>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {folder.children.map(child => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Loading folders...
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-slate-700">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Folders</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onCreateFolder(selectedFolderId)}
          className="h-7 w-7 p-0"
          title="Create folder"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable Folder List */}
      <div className="flex-1 overflow-y-auto">
        {/* Root (All Files) */}
        <div
          className={`
            flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors
            ${selectedFolderId === null 
              ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100' 
              : 'hover:bg-gray-100 dark:hover:bg-slate-800'
            }
          `}
          onClick={() => onSelectFolder(null)}
        >
          <Home className="h-4 w-4 text-gray-500" />
          <span className="text-sm">All Files</span>
        </div>

        {/* Folder Tree */}
        <div className="py-1">
          {folders.map(folder => renderFolder(folder))}
        </div>

        {folders.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-gray-500">
            No folders yet.
          </div>
        )}
      </div>

      {/* Upload Button at Bottom */}
      {onUploadClick && (
        <div className="mt-auto border-t border-gray-200 dark:border-slate-700 p-3">
          <Button
            onClick={onUploadClick}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
          >
            <Upload className="h-4 w-4" />
            Upload Files
          </Button>
        </div>
      )}

      {/* Context Menu - rendered via portal to avoid z-index issues */}
      {contextMenu && typeof window !== 'undefined' && createPortal(
        <>
          {/* Backdrop to close menu */}
          <div 
            className="fixed inset-0 z-[9998]"
            style={{ backgroundColor: 'transparent' }}
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-[9999] bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 py-1 min-w-[140px]"
            style={{ 
              top: `${contextMenu.y}px`, 
              left: `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - 150))}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
            onClick={() => {
              const folder = folders.find(f => f.id === contextMenu.folderId) || 
                folders.flatMap(f => f.children).find(f => f.id === contextMenu.folderId);
              if (folder) {
                setEditingId(folder.id);
                setEditingName(folder.name);
              }
              setContextMenu(null);
            }}
          >
            <Pencil className="h-3 w-3" />
            Rename
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
            onClick={() => {
              onCreateFolder(contextMenu.folderId);
              setContextMenu(null);
            }}
          >
            <FolderPlus className="h-3 w-3" />
            New subfolder
          </button>
          <hr className="my-1 border-gray-200 dark:border-slate-700" />
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-left"
            onClick={() => {
              handleDelete(contextMenu.folderId);
              setContextMenu(null);
            }}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </div>
        </>,
        document.body
      )}
    </div>
  );
}
