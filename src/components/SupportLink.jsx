import { supportDestination } from "../lib/support.js";

export function SupportLink({ children = "Support Anime Shuffle" }) {
  const destination = supportDestination();
  if (!destination) return null;
  return (
    <a
      className="footer-support"
      href={destination.url}
      rel="noreferrer"
      referrerPolicy="no-referrer"
    >
      {children}
    </a>
  );
}
