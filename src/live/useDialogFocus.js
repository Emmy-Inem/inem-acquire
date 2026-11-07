import { useEffect, useRef } from "react";
export function useDialogFocus(active, onClose, containerRef) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    const dialog =
      containerRef?.current || document.querySelector('[role="dialog"]');
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const selector =
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
    const focusable = () =>
      [...dialog.querySelectorAll(selector)].filter(
        (el) => el.getClientRects().length,
      );
    const frame = requestAnimationFrame(() => {
      const target = dialog.querySelector("[autofocus]") || focusable()[0];
      target?.focus({ preventScroll: true });
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
    const containFocus = (event) => {
      if (!dialog.contains(event.target))
        focusable()[0]?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", handle);
    document.addEventListener("focusin", containFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handle);
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus?.({ preventScroll: true });
    };
  }, [active]);
}
