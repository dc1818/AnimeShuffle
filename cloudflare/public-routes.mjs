/** Only anonymous metadata reads bypass the account/session mutation queue. */
export function isPublicMetadataRequest(request) {
  const path = new URL(request.url).pathname;
  return (
    request.method === "GET" &&
    (path === "/api/catalog" ||
      /^\/api\/(?:anime|trailer|pictures)\/\d+$/.test(path))
  );
}
