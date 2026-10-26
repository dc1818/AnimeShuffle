// Owner-provided public checkout URL. Never put payment credentials here.
export const SUPPORT_URL = "https://ko-fi.com/dc1818";

export function supportDestination(value = SUPPORT_URL) {
  try {
    const url = new URL(value);
    const providers = {
      "ko-fi.com": "Ko-fi",
      "www.ko-fi.com": "Ko-fi",
      "buymeacoffee.com": "Buy Me a Coffee",
      "www.buymeacoffee.com": "Buy Me a Coffee",
      "paypal.me": "PayPal",
      "www.paypal.com": "PayPal",
      "paypal.com": "PayPal",
    };
    const provider = providers[url.hostname];
    if (
      !provider ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname === "/"
    )
      return null;
    return { url: url.href, provider };
  } catch {
    return null;
  }
}
