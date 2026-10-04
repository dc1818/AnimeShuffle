import { browserLocalStorage } from "./lib/browser-storage.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { createDiagnostics } from "./lib/diagnostics.js";
import { createAnimeStore } from "./lib/store.js";

// A single store survives component remounts. Secrets and OAuth tokens remain
// in server.mjs; this entry point only calls our same-origin API routes.
const diagnostics = createDiagnostics({
  storage: browserLocalStorage(),
  enabled: new URLSearchParams(location.search).get("debugPerf") === "1",
});
// Read-only developer helpers; these never expose accounts, cookies or API credentials.
window.animeShuffleDebug = {
  on: diagnostics.on,
  off: diagnostics.off,
  report: diagnostics.report,
  clear: diagnostics.clear,
};
const store = createAnimeStore({
  diagnostics,
  staticMode: document.documentElement.dataset.hosting === "pages",
});
window.animeShuffleDebug.storage = async () => {
  const result = await store.inspectPersistence();
  console.log("[Anime Shuffle storage]", result);
  return result;
};
window.animeShuffleDebug.discovery = () => {
  const result = store.inspectDiscovery();
  console.log("[Anime Shuffle discovery]", result);
  return result;
};
window.animeShuffleDebug.enrichment = async () => {
  const result = await store.inspectEnrichment();
  console.log("[Anime Shuffle enrichment]", result.server, {
    historyWithReviewTraits: result.historyWithReviewTraits,
  });
  console.table(result.items);
  console.log(result.note);
  return result;
};
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);

// Optional read-only browser integration. Unsupported browsers simply skip it.
if (navigator.modelContext?.registerTool) {
  try {
    navigator.modelContext.registerTool({
      name: "current_anime",
      description: "Read the current Anime Shuffle recommendation.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const { current: anime, reason } = store.getSnapshot();
        return {
          content: [{ type: "text", text: JSON.stringify({ anime, reason }) }],
        };
      },
    });
  } catch {}
}
