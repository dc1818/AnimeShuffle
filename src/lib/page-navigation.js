import { useEffect, useState } from "react";

const pages = new Set(["discover", "watchlist", "recommendations"]);
export function pageFromHash(hash) {
  const page = hash.replace(/^#/, "");
  return pages.has(page) ? page : "discover";
}

/** Hash routes also work on GitHub Pages, without server rewrite rules. */
export function usePageNavigation(onLegacyProfile) {
  const [page, setPage] = useState(() => pageFromHash(window.location.hash));
  useEffect(() => {
    const restore = () => {
      if (window.location.hash === "#profile") {
        const url = new URL(window.location.href);
        url.hash = "discover";
        window.history.replaceState(window.history.state, "", url);
        onLegacyProfile?.();
      }
      setPage(pageFromHash(window.location.hash));
    };
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, [onLegacyProfile]);
  function navigate(next) {
    if (!pages.has(next) || next === page) return;
    const url = new URL(window.location.href);
    url.hash = next;
    window.history.pushState(null, "", url);
    setPage(next);
  }
  return [page, navigate];
}
