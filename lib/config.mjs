/** Canonical URLs come from operator configuration, never forwarded request headers. */
export function serverConfig(env = process.env) {
  const port = Number(env.PORT || 5173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("PORT must be an integer between 1024 and 65535.");
  const configured = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL;
  if (env.NODE_ENV === "production" && !configured)
    throw new Error("Set PUBLIC_ORIGIN to your public HTTPS address.");
  const url = new URL(configured || `http://localhost:${port}`);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "PUBLIC_ORIGIN must be an origin without a path, query or credentials.",
    );
  const local = url.origin === `http://localhost:${port}`;
  if (!local && url.protocol !== "https:")
    throw new Error("Public deployments require an HTTPS origin.");
  if (!local && !env.ANIME_SHUFFLE_DATA_DIR)
    throw new Error(
      "Set ANIME_SHUFFLE_DATA_DIR to persistent storage before hosting accounts.",
    );
  return {
    port,
    origin: url.origin,
    hosted: !local,
    host: local ? "127.0.0.1" : "0.0.0.0",
    allowedHosts: local
      ? [`localhost:${port}`, `127.0.0.1:${port}`]
      : [url.host],
  };
}
