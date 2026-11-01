import { createProviderFetch } from "../../lib/provider-fetch.mjs";

// Public catalog and media recovery share one browser budget. Never forward
// same-origin session headers, credentials, or the page's referrer upstream.
export const publicProviderFetch = createProviderFetch((input, options) =>
  fetch(input, {
    ...options,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    headers: { Accept: "application/json" },
  }),
);
