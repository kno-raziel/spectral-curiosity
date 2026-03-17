import { useRef, useState } from "react";

interface EditableTitleProps {
  title: string;
  expanded: boolean;
  onRename: (newTitle: string) => void;
}

export function EditableTitle({ title, expanded, onRename }: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setEditValue(title);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  return (
    <div className="text-[13px] font-medium whitespace-nowrap overflow-hidden text-ellipsis">
      <span
        className={`inline-block transition-transform duration-200 text-[10px] text-text-muted mr-1 ${expanded ? "rotate-90" : ""}`}
      >
        ▶
      </span>
      {editing ? (
        <input
          ref={inputRef}
          className="bg-bg-primary border border-accent-blue text-text-primary text-[13px] font-medium font-sans px-1.5 py-0.5 rounded w-full max-w-[500px] outline-none"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditing(false);
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        // biome-ignore lint/a11y/noStaticElementInteractions: double-click trigger nested inside parent <button>, cannot use <button> here
        <span
          className="cursor-text border-b border-transparent hover:border-text-muted transition-colors duration-150"
          onDoubleClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
          title="Double-click to rename"
        >
          {title}
        </span>
      )}
    </div>
  );
}
