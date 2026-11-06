import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

export default function HeroVideo() {
  const videoRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [visible, setVisible] = useState(true);
  const [playing, setPlaying] = useState(false);

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
    if (paused || reducedMotion || !visible) video.pause();
    else video.play().catch(() => setPlaying(false));
  }, [paused, reducedMotion, visible]);

  return <>
    <div className="heroVideoBackdrop" aria-hidden="true">
      <video ref={videoRef} muted loop playsInline preload={reducedMotion ? "none" : "metadata"}
        poster="/images/hero-collaboration-poster.jpg" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>
        {!reducedMotion && <source src="/videos/hero-team-collaboration.mp4" type="video/mp4" />}
      </video>
    </div>
    {!reducedMotion && <button type="button" className="heroVideoToggle" aria-label={playing ? "Pause background video" : "Play background video"}
      onClick={() => {
        if (playing) { setPaused(true); videoRef.current.pause(); }
        else { setPaused(false); videoRef.current.play().catch(() => setPlaying(false)); }
      }}>
      {playing ? <Pause size={14} /> : <Play size={14} />}
      <span>{playing ? "Pause video" : "Play video"}</span>
    </button>}
  </>;
}
