"use client";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { motionTokens } from "./PlatformMotion";
import { useDialogFocus } from "./live/useDialogFocus";

export default function MobileMenu({ open, onClose, id, children }) {
  const panel = useRef(null);
  const reduced = useReducedMotion();
  useDialogFocus(open, onClose, panel);
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          className="publicMobileLayer"
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionTokens.duration.fast }}
        >
          <button
            className="publicMenuScrim"
            onClick={onClose}
            tabIndex={-1}
            aria-hidden="true"
          />
          <m.section
            ref={panel}
            id={id}
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
            className="publicMobilePanel"
            initial={false}
            animate={
              reduced
                ? { opacity: [0.8, 1] }
                : { opacity: [0.8, 1], y: [motionTokens.distance.sm, 0] }
            }
            transition={{
              duration: motionTokens.duration.fast,
              ease: motionTokens.easing.smooth,
            }}
          >
            <div className="publicMobileHeading">
              <span>Explore Inem Acquire</span>
              <button
                type="button"
                className="iconButton"
                onClick={onClose}
                aria-label="Close navigation"
              >
                <X size={22} />
              </button>
            </div>
            {children}
          </m.section>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
