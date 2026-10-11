import { useState } from "react";
import { Icon } from "./Icon.jsx";

/** Works entirely from static assets, even when database startup fails. */
export function ServiceUnavailable({
  preview = false,
  onRetry = () => location.reload(),
}) {
  const [checking, setChecking] = useState(false);
  return (
    <div className="service-page">
      <header className="service-header">
        <a className="brand" href="/" aria-label="Anime Shuffle home">
          <img src="/assets/logo.png" alt="" width="92" height="62" />
          <span>
            Anime <b>Shuffle</b>
          </span>
        </a>
        {preview && (
          <a className="service-preview-link" href="/">
            Preview · Back to website
          </a>
        )}
      </header>
      <main className="service-main" aria-labelledby="service-title">
        <div className="service-art" aria-hidden="true">
          <div className="service-card service-card-back" />
          <div className="service-card service-card-front">
            <Icon name="shuffle" />
          </div>
          <span className="service-pause">
            <i />
            <i />
          </span>
        </div>
        <div className="service-status">
          <span /> Temporarily unavailable
        </div>
        <h1 id="service-title">Taking an intermission.</h1>
        <p className="service-intro">
          We can’t connect to Anime Shuffle right now.
        </p>
        <p className="service-description">
          Discover, recommendations and account features will return when the
          connection is restored.
        </p>
        <button
          className="service-retry"
          disabled={checking}
          onClick={() => {
            setChecking(true);
            if (preview) location.assign("/");
            else onRetry();
          }}
        >
          <Icon name="refresh" />
          {checking ? "Reconnecting…" : "Try again"}
        </button>
        <p className="service-hint" role="status">
          {checking
            ? "Checking the connection…"
            : "Still unavailable? Please check back in a little while."}
        </p>
      </main>
      <footer className="service-footer">
        Your next favorite anime can wait a moment.
      </footer>
    </div>
  );
}
