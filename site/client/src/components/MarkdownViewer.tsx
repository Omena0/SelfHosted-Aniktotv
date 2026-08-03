import React from 'react';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

/**
 * Render inline Markdown elements: bold (**), italic (*), inline code (`), links ([text](url))
 */
function renderInlineMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  const parts: React.ReactNode[] = [];
  let keyIdx = 0;

  // Regex to match inline markdown syntax
  const inlineRegex = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*]+\*|_[^_]+_)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const matchedStr = match[0];

    if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
      const codeText = matchedStr.slice(1, -1);
      parts.push(
        <code
          key={keyIdx++}
          className="px-1.5 py-0.5 rounded bg-[#1f2d40] text-[#209cee] font-mono text-xs border border-white/[0.08]"
        >
          {codeText}
        </code>
      );
    } else if (matchedStr.startsWith('[') && matchedStr.includes('](')) {
      const linkMatch = matchedStr.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a
            key={keyIdx++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#209cee] underline hover:text-[#3caedc] transition-colors"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        parts.push(matchedStr);
      }
    } else if (
      (matchedStr.startsWith('**') && matchedStr.endsWith('**')) ||
      (matchedStr.startsWith('__') && matchedStr.endsWith('__'))
    ) {
      const boldText = matchedStr.slice(2, -2);
      parts.push(
        <strong key={keyIdx++} className="font-bold text-white">
          {renderInlineMarkdown(boldText)}
        </strong>
      );
    } else if (
      (matchedStr.startsWith('*') && matchedStr.endsWith('*')) ||
      (matchedStr.startsWith('_') && matchedStr.endsWith('_'))
    ) {
      const italicText = matchedStr.slice(1, -1);
      parts.push(
        <em key={keyIdx++} className="italic text-slate-200">
          {renderInlineMarkdown(italicText)}
        </em>
      );
    } else {
      parts.push(matchedStr);
    }

    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content, className = '' }) => {
  if (!content || !content.trim()) {
    return <span className="text-slate-500 italic text-xs">No notes provided</span>;
  }

  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let elementIdx = 0;

  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={elementIdx++}
            className="p-3 my-2 rounded-lg bg-[#081019] border border-white/[0.08] text-xs font-mono text-cyan-300 overflow-x-auto"
          >
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (!line.trim()) {
      elements.push(<div key={elementIdx++} className="h-2" />);
      continue;
    }

    // Horizontal Rule Divider (---, ***, ___)
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      elements.push(
        <hr key={elementIdx++} className="border-t border-[#1a2a3e] my-3" />
      );
      continue;
    }

    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={elementIdx++} className="text-base font-extrabold text-white my-2 border-b border-[#1a2a3e] pb-1 font-archivo">
          {renderInlineMarkdown(line.slice(2))}
        </h1>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={elementIdx++} className="text-sm font-bold text-white my-1.5 font-archivo">
          {renderInlineMarkdown(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={elementIdx++} className="text-xs font-bold text-[#209cee] my-1 font-archivo">
          {renderInlineMarkdown(line.slice(4))}
        </h3>
      );
      continue;
    }

    if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={elementIdx++}
          className="border-l-4 border-[#209cee] pl-3 py-1 my-1.5 text-xs text-slate-300 italic bg-[#0b1622]/60 rounded-r"
        >
          {renderInlineMarkdown(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const listContent = line.replace(/^\s*[-*]\s+/, '');
      elements.push(
        <div key={elementIdx++} className="flex items-start gap-2 text-xs text-slate-300 my-0.5 pl-2">
          <span className="text-[#209cee] font-bold mt-0.5">•</span>
          <div>{renderInlineMarkdown(listContent)}</div>
        </div>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const numMatch = line.match(/^\s*(\d+)\.\s+(.*)/);
      if (numMatch) {
        elements.push(
          <div key={elementIdx++} className="flex items-start gap-2 text-xs text-slate-300 my-0.5 pl-2">
            <span className="text-[#209cee] font-bold text-[11px] mt-0.5">{numMatch[1]}.</span>
            <div>{renderInlineMarkdown(numMatch[2])}</div>
          </div>
        );
        continue;
      }
    }

    elements.push(
      <p key={elementIdx++} className="text-xs text-slate-300 leading-relaxed my-1">
        {renderInlineMarkdown(line)}
      </p>
    );
  }

  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre
        key={elementIdx++}
        className="p-3 my-2 rounded-lg bg-[#081019] border border-white/[0.08] text-xs font-mono text-cyan-300 overflow-x-auto"
      >
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
};
