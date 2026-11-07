import { useEffect, useRef, useState } from "react";

export default function HeroVideo() {
  const videoRef = useRef(null);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(videoRef.current);
    return () => {
      preference.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (reducedMotion || !visible) video.pause();
    else video.play().catch(() => {});
  }, [reducedMotion, visible]);

  return <>
    <div className="heroVideoBackdrop" aria-hidden="true">
      <video ref={videoRef} muted loop playsInline preload={reducedMotion ? "none" : "metadata"}
        poster="/images/hero-collaboration-poster.jpg">
        {!reducedMotion && <source src="/videos/hero-team-collaboration.mp4" type="video/mp4" />}
      </video>
    </div>
  </>;
}
