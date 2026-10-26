import { Icon } from "./Icon.jsx";
import { SUPPORT_URL, supportDestination } from "../lib/support.js";

export function SupportPanel({ supportUrl = SUPPORT_URL }) {
  const destination = supportDestination(supportUrl);
  return (
    <section className="support-panel" aria-labelledby="support-title">
      <span className="support-symbol">
        <Icon name="heart" />
      </span>
      <h3 id="support-title">Support Anime Shuffle</h3>
      <p>
        If Anime Shuffle helped you find your next favorite, you can leave an
        optional tip to help with hosting and continued development.
      </p>
      <div className="support-card">
        <h4>A small thank-you. Always optional.</h4>
        <p>
          Donating does not unlock features or change your recommendations. You
          get the same discovery experience either way.
        </p>
        {destination ? (
          <>
            <a
              className="primary support-checkout"
              href={destination.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Leave a tip on {destination.provider} <Icon name="external" />
            </a>
            <small>
              Opens {destination.provider} in a new tab. Payment is handled
              there; Anime Shuffle does not collect your card details.
            </small>
          </>
        ) : (
          <p className="support-unavailable">
            Tips aren’t available yet. Thanks for being here and trying Anime
            Shuffle.
          </p>
        )}
      </div>
      <p className="support-no-payment">
        Sharing Anime Shuffle with a friend is another way to help. No donation
        needed.
      </p>
    </section>
  );
}
