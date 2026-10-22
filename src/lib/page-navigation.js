import { useEffect, useState } from "react";

const pages = new Set(["discover", "watchlist", "recommendations", "profile"]);
export function pageFromHash(hash) {
  const page = hash.replace(/^#/, "");
  return pages.has(page) ? page : "discover";
}

/** Hash routes also work on GitHub Pages, without server rewrite rules. */
export function usePageNavigation() {
  const [page, setPage] = useState(() => pageFromHash(window.location.hash));
  useEffect(() => {
    const restore = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);
  function navigate(next) {
    if (!pages.has(next) || next === page) return;
    const url = new URL(window.location.href);
    url.hash = next;
    window.history.pushState(null, "", url);
    setPage(next);
  }
  return [page, navigate];
}
