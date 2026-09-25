import { useEffect, useRef, type ReactNode } from "react";

/** Simple accessible dialog: Escape and backdrop click close it, focus moves inside on open. */
export function Modal({ onClose, labelledBy, children, as = "div", onSubmit, wide = false }: {
  wide?: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  as?: "div" | "form";
  onSubmit?: (e: React.FormEvent) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button:not(.modal-close)");
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const Tag = as;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Tag
        ref={ref as never}
        className={wide ? "panel wide" : "panel"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onSubmit={onSubmit}
        noValidate={as === "form" ? true : undefined}
      >
        <button type="button" className="modal-close" aria-label="Close" onClick={() => closeRef.current()}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
        {children}
      </Tag>
    </div>
  );
}
