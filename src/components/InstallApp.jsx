import { Icon } from "./Icon.jsx";

export function ApkDownloadButton({ descriptionId }) {
  return (
    <button
      className="apk-download full-width"
      disabled
      aria-describedby={descriptionId}
    >
      <Icon name="download" /> Download Android app
    </button>
  );
}
export function InstallApp() {
  return (
    <section className="install-app" aria-labelledby="install-app-title">
      <div className="install-app-heading">
        <img src="./assets/app-icon-192.png" width="48" height="48" alt="" />
        <div>
          <h3 id="install-app-title">Android app</h3>
          <p>Coming soon</p>
        </div>
      </div>
      <p>
        The Android app is being built. Its APK download will be available here
        when it’s ready.
      </p>
      <ApkDownloadButton descriptionId="apk-settings-status" />
      <p className="install-app-help" id="apk-settings-status">
        APK download · Coming soon
      </p>
      <p>
        Keep using the website with your Anime Shuffle or linked MyAnimeList
        account. The app will use the same account for saved anime, reactions
        and viewing preferences.
      </p>
    </section>
  );
}
