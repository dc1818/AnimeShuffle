import { useEffect, useState } from "react";

export function AmbientBackground({ enabled = true }) {
  const [paused, setPaused] = useState(() => document.visibilityState === "hidden");
  useEffect(() => {
    const update = () => setPaused(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return <div className="ambient" data-enabled={enabled} data-paused={paused} aria-hidden="true"><i /><i /><i /></div>;
}
