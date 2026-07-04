import { FileNode } from "../types";

export function buildFileTree(files: FileNode[]): FileNode[] {
  const root: FileNode[] = [];

  files.forEach(file => {
    if (!file.path) return;
    const parts = file.path.split('/');
    let currentLevel = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      let existing = currentLevel.find(node => node.name === part);

      if (!existing) {
        existing = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          type: isLast ? 'file' : 'directory',
          children: isLast ? undefined : [],
          content: isLast ? file.content : undefined
        };
        currentLevel.push(existing);
      }

      if (existing.children) {
        currentLevel = existing.children;
      }
    });
  });

  return root;
}
