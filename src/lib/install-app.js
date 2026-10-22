/** Browser-owned Android installation keeps the production origin and its accounts. */
export function createInstallController(win) {
  const display = win.matchMedia?.("(display-mode: standalone)");
  const listeners = new Set();
  let promptEvent = null;
  let snapshot = {
    installed: !!display?.matches || win.navigator.standalone === true,
    canInstall: false,
    busy: false,
    message: "",
  };
  const update = (patch) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event;
    update({ canInstall: true, message: "" });
  });
  win.addEventListener("appinstalled", () => {
    promptEvent = null;
    update({ installed: true, canInstall: false, busy: false, message: "" });
  });
  display?.addEventListener?.("change", (event) => {
    if (event.matches) update({ installed: true, canInstall: false });
  });
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async install() {
      if (!promptEvent || snapshot.busy || snapshot.installed) return;
      const event = promptEvent;
      promptEvent = null; // A browser installation prompt is single-use.
      update({ canInstall: false, busy: true, message: "" });
      try {
        await event.prompt();
        const choice = await event.userChoice;
        // Acceptance isn't proof that installation finished; appinstalled is.
        if (!snapshot.installed)
          update({
            message:
              choice.outcome === "accepted"
                ? "Finish installing in your browser, then open Anime Shuffle from your home screen."
                : "You can install later from your browser’s menu.",
          });
      } catch {
        update({
          message: "Use your browser’s menu to install Anime Shuffle.",
        });
      } finally {
        update({ busy: false });
      }
    },
  };
}

const unavailable = {
  installed: false,
  canInstall: false,
  busy: false,
  message: "",
};
export const appInstall =
  typeof window === "undefined"
    ? {
        getSnapshot: () => unavailable,
        subscribe: () => () => {},
        install: async () => {},
      }
    : createInstallController(window);

export function registerAppWorker(win = window) {
  if (
    !win.isSecureContext ||
    !win.navigator.serviceWorker ||
    win.document.documentElement.dataset.hosting === "pages"
  )
    return;
  // Only a public offline page is cached. API, OAuth and application bundles
  // continue using their normal network behavior and existing account sync.
  void win.navigator.serviceWorker
    .register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    })
    .catch(() => {}); // Installation support must never block discovery/login.
}
