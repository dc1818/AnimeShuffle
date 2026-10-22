// The downloadable Android APK is not released yet. Do not offer PWA install prompts.
export const ANDROID_CHOICE_KEY = "anime-shuffle:android-app-choice:v1";
let dismissedThisPage = false;
export function shouldOfferAndroidApp(win = window) {
  const nav = win.navigator;
  const platform = nav.userAgentData?.platform || nav.userAgent || "";
  const mobile =
    nav.userAgentData?.mobile ?? /Mobile/i.test(nav.userAgent || "");
  if (
    !/Android/i.test(platform) ||
    !mobile ||
    dismissedThisPage ||
    win.matchMedia?.("(display-mode: standalone)").matches ||
    win.document.documentElement.dataset.hosting === "pages"
  )
    return false;
  try {
    return !win.localStorage.getItem(ANDROID_CHOICE_KEY);
  } catch {
    return true;
  }
}
export function rememberWebsiteChoice(win = window) {
  dismissedThisPage = true;
  try {
    win.localStorage.setItem(ANDROID_CHOICE_KEY, "website");
  } catch {}
}
export function suppressBrowserInstall(win = window) {
  win.addEventListener("beforeinstallprompt", (event) =>
    event.preventDefault(),
  );
}

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
