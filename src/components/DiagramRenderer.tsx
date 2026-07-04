import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface DiagramRendererProps {
  code: string;
}

function buildFallbackMermaidDiagram(source: string): string {
  const trimmed = source?.trim() || '';
  const fallbackLabel = trimmed
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || 'Diagram unavailable';

  return `flowchart TD\n  A["${fallbackLabel}"]\n  B["Preview"]\n  A --> B`;
}

function sanitizeMermaidCode(mermaidCode: string): string {
  if (!mermaidCode) return '';
  const lines = mermaidCode.split('\n');
  const idMap = new Map<string, string>();
  const definedLabels = new Set<string>();
  const sanitizedLines: string[] = [];

  const passThroughKeywords = [
    'subgraph', 'end', 'direction', 'title', 'click', 'classDef', 'class', 'linkStyle'
  ];

  const arrowSplitRegex = /(\s*(?:-->\|.*?\||-->|--.*?-->|--.*?---|---|-.->\|.*?\||-.->|-\..*?\.->|==>\|.*?\||==>|==.*?==>|==.*?==)\s*)/;

  function parseNodePart(part: string): { id: string; label?: string; bracketType?: string } {
    part = part.trim();
    const bracketIndex = part.search(/\[|\(|\{|\>/);
    if (bracketIndex !== -1) {
      const id = part.substring(0, bracketIndex).trim();
      const opener = part[bracketIndex];
      let content = part.substring(bracketIndex + 1);
      
      content = content.trim().replace(/\]\s*$|\)\s*$|\}\s*$|>\s*$/, '');
      if (content.startsWith('"') && content.endsWith('"')) {
        content = content.substring(1, content.length - 1);
      } else if (content.startsWith("'") && content.endsWith("'")) {
        content = content.substring(1, content.length - 1);
      }
      return { id, label: content, bracketType: opener };
    }
    return { id: part };
  }

  for (let rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      sanitizedLines.push('');
      continue;
    }

    if (/^(?:graph|flowchart)\s+/i.test(trimmed)) {
      sanitizedLines.push(trimmed.replace(/^flowchart\s+/i, 'flowchart '));
      continue;
    }

    if (trimmed.startsWith('%%')) {
      sanitizedLines.push(trimmed);
      continue;
    }

    const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
    if (passThroughKeywords.includes(firstWord)) {
      sanitizedLines.push(rawLine);
      continue;
    }

    if (firstWord === 'style') {
      const match = trimmed.match(/^style\s+([a-zA-Z0-9_\-\.\/]+)\s+(.+)$/i);
      if (match) {
        const targetNode = match[1];
        const styles = match[2];
        sanitizedLines.push(`__STYLE__:${targetNode}:${styles}`);
        continue;
      }
    }

    const parts = trimmed.split(arrowSplitRegex);
    const reconstructedParts: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i % 2 === 1) {
        reconstructedParts.push(part);
      } else {
        const node = parseNodePart(part);
        if (!node.id) {
          reconstructedParts.push('');
          continue;
        }

        let safeId = idMap.get(node.id);
        if (!safeId) {
          safeId = `n_${idMap.size}`;
          idMap.set(node.id, safeId);
        }

        const label = node.label || node.id;
        if (!definedLabels.has(safeId)) {
          const cleanLabel = label.replace(/"/g, '\\"');
          reconstructedParts.push(`${safeId}["${cleanLabel}"]`);
          definedLabels.add(safeId);
        } else {
          reconstructedParts.push(safeId);
        }
      }
    }

    const indent = rawLine.match(/^\s*/)?.[0] || '  ';
    sanitizedLines.push(indent + reconstructedParts.join(''));
  }

  for (let i = 0; i < sanitizedLines.length; i++) {
    const line = sanitizedLines[i];
    if (line.startsWith('__STYLE__:')) {
      const parts = line.split(':');
      const targetNode = parts[1];
      const styles = parts.slice(2).join(':');
      const safeId = idMap.get(targetNode);
      if (safeId) {
        sanitizedLines[i] = `  style ${safeId} ${styles}`;
      } else {
        sanitizedLines[i] = '';
      }
    }
  }

  return sanitizedLines.filter(l => l !== '').join('\n');
}

export const DiagramRenderer: React.FC<DiagramRendererProps> = ({ code }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: 'Inter',
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    const renderDiagram = async () => {
      if (containerRef.current && code && isMounted) {
        try {
          setError(null);
          // Clean the code if it contains markdown backticks
          const cleanCode = code
            .replace(/\\n/g, '\n')
            .replace(/```mermaid/g, '')
            .replace(/```/g, '')
            .trim();
          
          if (!cleanCode) return;

          const safeMermaidCode = sanitizeMermaidCode(cleanCode);
          const diagramToRender = safeMermaidCode || buildFallbackMermaidDiagram(cleanCode);

          const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
          try {
            await mermaid.parse(diagramToRender);
            const { svg } = await mermaid.render(id, diagramToRender);
            if (isMounted && containerRef.current) {
              containerRef.current.innerHTML = svg;
            }
          } catch (parseError) {
            const fallbackDiagram = buildFallbackMermaidDiagram(cleanCode);
            const { svg } = await mermaid.render(id, fallbackDiagram);
            if (isMounted && containerRef.current) {
              containerRef.current.innerHTML = svg;
            }
          }
        } catch (err) {
          if (isMounted) {
            console.error("Mermaid render error:", err);
            setError("Failed to render architecture diagram. The generated code might be invalid.");
          }
        }
      }
    };

    renderDiagram();
    return () => { isMounted = false; };
  }, [code]);

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="w-full overflow-auto p-8 bg-card/50 rounded-2xl border border-primary/5 min-h-[400px] flex items-center justify-center">
      <div ref={containerRef} className="max-w-full" />
    </div>
  );
};
