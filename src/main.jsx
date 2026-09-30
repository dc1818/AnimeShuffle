import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { createAnimeStore } from "./lib/store.js";

// A single store survives component remounts. Secrets and OAuth tokens remain
// in server.mjs; this entry point only calls our same-origin API routes.
const store = createAnimeStore();
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
