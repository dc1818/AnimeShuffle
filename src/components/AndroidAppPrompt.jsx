import { useEffect, useRef } from "react";
import { ApkDownloadButton } from "./InstallApp.jsx";
import { Icon } from "./Icon.jsx";
import { rememberWebsiteChoice } from "../lib/install-app.js";

export function AndroidAppPrompt({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const dismiss = () => {
    rememberWebsiteChoice();
    onClose();
  };
  return (
    <dialog
      ref={ref}
      className="android-app-sheet"
      aria-labelledby="android-app-title"
      aria-describedby="android-app-description"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          dismiss();
      }}
    >
      <div className="android-app-handle" aria-hidden="true" />
      <button
        className="icon-button android-app-close"
        onClick={dismiss}
        aria-label="Close app invitation"
      >
        <Icon name="close" />
      </button>
      <div className="android-app-brand">
        <img src="./assets/app-icon-192.png" width="48" height="48" alt="" />
        <span className="eyebrow">Anime Shuffle for Android</span>
      </div>
      <h2 id="android-app-title">How would you like to explore?</h2>
      <p id="android-app-description">
        Keep discovering here. Our Android app is coming soon.
      </p>
      <p className="android-app-sync">
        Same account. Same watchlist and preferences.
      </p>
      <ApkDownloadButton descriptionId="apk-prompt-status" />
      <p className="android-app-status" id="apk-prompt-status">
        APK download · Coming soon
      </p>
      <button
        className="outline full-width android-app-continue"
        onClick={dismiss}
        autoFocus
      >
        Continue on website
      </button>
      <p className="android-app-footer">
        You can find the app in Settings when it’s ready.
      </p>
    </dialog>
  );
}
