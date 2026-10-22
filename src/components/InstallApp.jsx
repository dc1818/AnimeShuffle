import { useSyncExternalStore } from "react";
import { appInstall } from "../lib/install-app.js";

export function InstallApp({ controller = appInstall }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return (
    <section className="install-app" aria-labelledby="install-app-title">
      <div className="install-app-heading">
        <img src="./assets/app-icon-192.png" width="48" height="48" alt="" />
        <div>
          <h3 id="install-app-title">
            {state.installed ? "Anime Shuffle app" : "Get the Android app"}
          </h3>
          <p>
            {state.installed
              ? "Installed on this device."
              : "Your anime, one tap from your home screen."}
          </p>
        </div>
      </div>
      <p>
        Sign into the same Anime Shuffle account or linked MyAnimeList account
        on every device to sync saved anime, reactions and viewing preferences.
        Guest saves stay on this device until you sign in.
      </p>
      {!state.installed && (
        <>
          {state.canInstall && (
            <button
              className="primary full-width"
              disabled={state.busy}
              onClick={() => controller.install()}
            >
              Install Anime Shuffle
            </button>
          )}
          <p className="install-app-help">
            {state.canInstall
              ? "Installs from your browser and stays up to date with the website."
              : "On Android, open animeshuffle.com in Chrome, then use its ⋮ menu → Add to home screen → Install. The wording may vary by browser. On iPhone, use Safari → Share → Add to Home Screen."}
          </p>
        </>
      )}
      {state.message && <p role="status">{state.message}</p>}
    </section>
  );
}
