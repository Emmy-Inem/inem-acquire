import { useEffect, useRef } from "react";
export function useDialogFocus(active, onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;
    const selector =
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
    const focusable = () =>
      [...dialog.querySelectorAll(selector)].filter(
        (el) => el.getClientRects().length,
      );
    const frame = requestAnimationFrame(() => {
      const target = dialog.querySelector("[autofocus]") || focusable()[0];
      target?.focus();
    });
    const handle = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusable(),
        first = nodes[0],
        last = nodes.at(-1);
      if (!first) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", handle);
    return () => {
      cancelAnimationFrame(frame);
      dialog.removeEventListener("keydown", handle);
      previous?.focus?.();
    };
  }, [active]);
}
