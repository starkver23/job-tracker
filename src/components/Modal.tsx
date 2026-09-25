import { useEffect, useRef, type ReactNode } from "react";

/** Simple accessible dialog: Escape and backdrop click close it, focus moves inside on open. */
export function Modal({ onClose, labelledBy, children, as = "div", onSubmit }: {
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
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button");
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const Tag = as;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Tag
        ref={ref as never}
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onSubmit={onSubmit}
        noValidate={as === "form" ? true : undefined}
      >
        {children}
      </Tag>
    </div>
  );
}
