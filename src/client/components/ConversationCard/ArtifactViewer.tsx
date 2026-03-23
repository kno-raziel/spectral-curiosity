import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchArtifactContent, getArtifactUrl } from "../../api";

interface ArtifactViewerProps {
  conversationId: string;
  artifactName: string;
  onClose: () => void;
}

/**
 * Slide-out panel showing full artifact content.
 * Uses a React Portal to escape parent stacking contexts.
 */
export function ArtifactViewer({ conversationId, artifactName, onClose }: ArtifactViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(artifactName);
  const artifactUrl = getArtifactUrl(conversationId, artifactName);

  useEffect(() => {
    if (isImage) return; // Images are rendered directly via URL

    let cancelled = false;
    setContent(null);
    setError(null);

    fetchArtifactContent(conversationId, artifactName)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, artifactName, isImage]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <>
      {/* Backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handler covers keyboard */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-9990" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 w-[min(700px,85vw)] bg-bg-primary z-9999 flex flex-col shadow-[−8px_0_30px_rgba(0,0,0,0.5)] animate-[slideIn_0.2s_ease]"
        style={{ borderLeft: "2px solid var(--color-accent-blue)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-secondary shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-accent-blue">{isImage ? "🖼️" : "📄"}</span>
            <span className="text-sm font-mono truncate">{artifactName}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={artifactUrl}
              download={artifactName}
              target="_blank"
              rel="noopener"
              className="text-text-muted hover:text-text-primary text-xs font-medium flex items-center justify-center bg-bg-primary border border-border cursor-pointer px-3 py-1.5 rounded hover:bg-bg-tertiary transition-colors no-underline"
              title="Download Artifact"
            >
              ⬇ Export
            </a>
            <button
              type="button"
              className="text-text-muted hover:text-text-primary text-lg bg-transparent border-none cursor-pointer px-2 py-1 flex items-center rounded hover:bg-bg-tertiary transition-colors"
              onClick={onClose}
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="text-accent-red text-sm p-3 rounded bg-accent-red/10 border border-accent-red/20">
              Failed to load: {error}
            </div>
          )}

          {isImage ? (
            <div className="flex items-center justify-center min-h-[50vh]">
              <img
                src={artifactUrl}
                alt={artifactName}
                className="max-w-full rounded border border-border shadow-lg"
              />
            </div>
          ) : (
            <>
              {!content && !error && (
                <div className="text-text-muted text-sm animate-pulse">Loading…</div>
              )}
              {content && (
                <div
                  className="artifact-content text-sm leading-relaxed text-text-primary"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: controlled markdown rendering
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Lightweight markdown renderer ──────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  const codeLines: string[] = [];

  for (const line of lines) {
    // Code block toggle
    if (line.trimStart().startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trimStart().slice(3).trim();
        codeLines.length = 0;
      } else {
        const langLabel = codeBlockLang
          ? `<span class="text-text-muted text-[10px] float-right">${escapeHtml(codeBlockLang)}</span>`
          : "";
        out.push(
          `<pre class="bg-bg-tertiary rounded-md p-3 my-2 overflow-x-auto text-[12px] font-mono leading-snug border border-border">${langLabel}<code>${codeLines.join("\n")}</code></pre>`,
        );
        inCodeBlock = false;
        codeBlockLang = "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(escapeHtml(line));
      continue;
    }

    // Headers
    const headerMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const sizes: Record<number, string> = {
        1: "text-xl font-bold mt-5 mb-2",
        2: "text-lg font-bold mt-4 mb-2",
        3: "text-base font-semibold mt-3 mb-1.5",
        4: "text-sm font-semibold mt-2 mb-1",
        5: "text-sm font-medium mt-2 mb-1",
        6: "text-xs font-medium mt-2 mb-1 text-text-muted",
      };
      out.push(`<h${level} class="${sizes[level]}">${renderInline(headerMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      out.push('<hr class="border-border my-4" />');
      continue;
    }

    // Blockquote
    if (line.trimStart().startsWith("> ")) {
      const content = line.trimStart().slice(2);
      out.push(
        `<blockquote class="border-l-2 border-accent-blue pl-3 my-1 text-text-secondary italic">${renderInline(content)}</blockquote>`,
      );
      continue;
    }

    // List items
    if (/^\s*[-*]\s+/.test(line)) {
      const content = line.replace(/^\s*[-*]\s+/, "");
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const ml = indent > 0 ? ` style="margin-left:${indent * 8}px"` : "";
      out.push(
        `<div class="flex gap-1.5 my-0.5"${ml}><span class="text-text-muted shrink-0">•</span><span>${renderInline(content)}</span></div>`,
      );
      continue;
    }

    // Empty line = paragraph break
    if (line.trim() === "") {
      out.push('<div class="h-2"></div>');
      continue;
    }

    // Regular paragraph
    out.push(`<p class="my-0.5">${renderInline(line)}</p>`);
  }

  // Close unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    out.push(
      `<pre class="bg-bg-tertiary rounded-md p-3 my-2 overflow-x-auto text-[12px] font-mono leading-snug border border-border"><code>${codeLines.join("\n")}</code></pre>`,
    );
  }

  return out.join("\n");
}

function renderInline(text: string): string {
  let html = escapeHtml(text);
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="bg-bg-tertiary px-1 py-0.5 rounded text-[12px] font-mono text-accent-purple">$1</code>',
  );
  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-accent-blue hover:underline" target="_blank" rel="noopener">$1</a>',
  );
  return html;
}
