export type FlatFolder = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  fileCount?: number;
  childCount?: number;
  createdAt?: string;
};

export type FolderTreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  fileCount: number;
  childCount: number;
  children: FolderTreeNode[];
};

export const buildFolderTree = (
  flatFolders: FlatFolder[],
): FolderTreeNode[] => {
  const nodes = new Map<string, FolderTreeNode>();

  for (const folder of flatFolders) {
    nodes.set(folder.id, {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId ?? null,
      color: folder.color ?? null,
      fileCount: folder.fileCount ?? 0,
      childCount: folder.childCount ?? 0,
      children: [],
    });
  }

  const roots: FolderTreeNode[] = [];

  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (items: FolderTreeNode[]) => {
    items.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    for (const item of items) {
      sortTree(item.children);
      item.childCount = item.children.length;
    }
  };

  sortTree(roots);
  return roots;
};
