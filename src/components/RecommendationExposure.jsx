import { useEffect, useRef } from "react";
/** Count actual viewport exposure, not every fetched or off-screen candidate. */
export function RecommendationExposure({
  animeId,
  surface,
  position,
  onSeen,
  children,
  ...props
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (!onSeen || !globalThis.IntersectionObserver) return;
    let visible = false,
      recorded = false;
    const report = () => {
      if (visible && document.visibilityState !== "hidden" && !recorded) {
        recorded = true;
        onSeen(animeId, { surface, position });
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        report();
      },
      { threshold: 0.1 },
    );
    observer.observe(
      surface === "discover" ? ref.current.firstElementChild : ref.current,
    );
    document.addEventListener("visibilitychange", report);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", report);
    };
  }, [animeId, surface, position, onSeen]);
  return (
    <div
      ref={ref}
      style={surface === "discover" ? { display: "contents" } : undefined}
      {...props}
    >
      {children}
    </div>
  );
}
