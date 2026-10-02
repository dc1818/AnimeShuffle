/** MAL sometimes returns its missing-synopsis prompt as if it were a summary. */
export function synopsisText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^no synopsis (?:information has been added|available)/i.test(text)
    ? ""
    : text;
}
