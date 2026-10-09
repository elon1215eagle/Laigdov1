import { useEffect, useRef } from "react";
export function CheckoutDialog({ title, onClose, children, className = "", busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; ref.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  function keys(e) {
    if (e.key === "Escape" && !busy) onClose();
    if (e.key !== "Tab") return;
    const nodes = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
    const first = nodes[0], last = nodes.at(-1);
    if (!nodes.length) { e.preventDefault(); return; }
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
  }
  return <div className="qc-overlay"><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onKeyDown={keys} className={`qc-dialog ${className}`}><header className="qc-dialog-header"><h2>{title}</h2><button type="button" disabled={busy} onClick={onClose}>返回</button></header>{children}</section></div>;
}
