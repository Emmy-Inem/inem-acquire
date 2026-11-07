"use client";
import React, { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  animate,
  LazyMotion,
  domAnimation,
  MotionConfig,
  m,
  useReducedMotion,
} from "motion/react";

export const motionTokens = {
  duration: { instant: 0.08, fast: 0.18, normal: 0.35, slow: 0.6 },
  easing: { smooth: [0.22, 1, 0.36, 1] },
  distance: { xs: 4, sm: 8 },
  scale: { subtle: 0.98, press: 0.97, pop: 1.02 },
};
export const springs = {
  snappy: { type: "spring", stiffness: 300, damping: 30 },
  gentle: { type: "spring", stiffness: 120, damping: 20 },
  bouncy: { type: "spring", stiffness: 400, damping: 18 },
  instant: { type: "spring", stiffness: 600, damping: 35 },
  release: { type: "spring", stiffness: 200, damping: 20, restDelta: 0.001 },
};
export function shouldAnimate(reduced, essential = false) {
  return (
    !reduced &&
    (essential ||
      typeof navigator === "undefined" ||
      navigator.hardwareConcurrency > 4)
  );
}

export function MotionFeedback({ children }) {
  const reduced = useReducedMotion();
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  useEffect(() => {
    if (!shouldAnimate(reduced)) return;
    const controls = [];
    const nodes = new Set();
    const selector =
      ".appMain>.pageHeader,.appMain>.stats,.appMain>.panel,.appMain>.diagnosisHero,.appMain>.findingGrid,.liveSetup>form,.authForm>form,.homeMain>section,.heroCopy,.heroSignup,.liveModal";
    const clear = (node) => {
      node.style.removeProperty("transform");
      node.style.removeProperty("opacity");
    };
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          const control = animate(
            entry.target,
            { opacity: [0.85, 1], y: [motionTokens.distance.xs, 0] },
            {
              duration: motionTokens.duration.fast,
              ease: motionTokens.easing.smooth,
            },
          );
          controls.push(control);
          control.then(() => clear(entry.target));
        }),
      { threshold: 0.02 },
    );
    const discover = (root) => {
      if (!(root instanceof Element)) return;
      const matches = root.matches(selector)
        ? [root, ...root.querySelectorAll(selector)]
        : root.querySelectorAll(selector);
      matches.forEach((node) => {
        if (!nodes.has(node)) {
          nodes.add(node);
          observer.observe(node);
        }
      });
    };
    discover(document.getElementById("root"));
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(discover));
      nodes.forEach((node) => {
        if (!node.isConnected) {
          observer.unobserve(node);
          nodes.delete(node);
        }
      });
    });
    mutations.observe(document.getElementById("root"), {
      childList: true,
      subtree: true,
    });
    return () => {
      mutations.disconnect();
      observer.disconnect();
      controls.forEach((c) => c.stop());
      nodes.forEach(clear);
    };
  }, [pathname, reduced]);
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation}>{children}</LazyMotion>
    </MotionConfig>
  );
}

export function AnimatedPreview({ children, previewKey }) {
  const reduced = useReducedMotion();
  return (
    <m.div
      className="animatedPreview"
      key={previewKey}
      initial={false}
      animate={
        shouldAnimate(reduced, true)
          ? { opacity: [0.65, 1], y: [motionTokens.distance.xs, 0] }
          : { opacity: 1, y: 0 }
      }
      transition={{
        duration: motionTokens.duration.fast,
        ease: motionTokens.easing.smooth,
      }}
    >
      {children}
    </m.div>
  );
}
