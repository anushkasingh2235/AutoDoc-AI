import React from 'react';
import { FileNode } from '../types';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileTreeProps {
  nodes: FileNode[];
  onFileSelect: (node: FileNode) => void;
  selectedPath?: string;
}

export const FileTree: React.FC<FileTreeProps> = ({ nodes, onFileSelect, selectedPath }) => {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const toggle = (path: string) => {
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isExpanded = expanded[node.path];
    const isSelected = selectedPath === node.path;

    return (
      <div key={node.path}>
        <div
          className={cn(
            "flex items-center py-1 px-2 cursor-pointer hover:bg-accent/50 rounded-sm text-sm transition-colors",
            isSelected && "bg-accent text-accent-foreground",
            depth > 0 && "ml-4"
          )}
          onClick={() => {
            if (node.type === 'directory') {
              toggle(node.path);
            } else {
              onFileSelect(node);
            }
          }}
        >
          {node.type === 'directory' ? (
            <>
              {isExpanded ? <ChevronDown className="w-4 h-4 mr-1 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 mr-1 text-muted-foreground" />}
              <Folder className="w-4 h-4 mr-2 text-primary/70" />
            </>
          ) : (
            <>
              <div className="w-4 mr-1" />
              <File className="w-4 h-4 mr-2 text-muted-foreground/50" />
            </>
          )}
          <span className="truncate">{node.name}</span>
        </div>
        {node.type === 'directory' && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="py-2">
      {nodes.map(node => renderNode(node))}
    </div>
  );
};
