/** Representative cover colors; RGB output must always contain three channels. */
export function paletteFromPixels(pixels) {
  const buckets = new Map();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const high = Math.max(...rgb),
      low = Math.min(...rgb);
    if (pixels[i + 3] < 128 || high < 24 || low > 242) continue;
    const key = rgb.map((n) => Math.floor(n / 32)).join(":");
    const bucket = buckets.get(key) || {
      count: 0,
      sum: [0, 0, 0],
      saturation: 0,
    };
    bucket.count++;
    rgb.forEach((n, c) => (bucket.sum[c] += n));
    bucket.saturation += (high - low) / Math.max(1, high);
    buckets.set(key, bucket);
  }
  const colors = [...buckets.values()]
    .map((b) => ({
      rgb: b.sum.map((n) => Math.round(n / b.count)),
      count: b.count,
      weight: b.count * (0.15 + b.saturation / b.count),
    }))
    .sort((a, b) => b.weight - a.weight);
  if (!colors.length) return null;
  // White/gray cover lettering and borders should not drown out actual cover hues.
  const chromatic = colors.filter(
    ({ rgb, count }) =>
      (Math.max(...rgb) - Math.min(...rgb)) / Math.max(1, ...rgb) >= 0.22 &&
      count >= Math.max(1, colors[0].count * 0.03),
  );
  const representatives = chromatic.length ? chromatic : colors;
  const primary = representatives[0];
  const distance = (c) =>
    c.rgb.reduce((sum, n, i) => sum + (n - primary.rgb[i]) ** 2, 0);
  const secondary = representatives
    .filter((c) => c.count >= Math.max(1, primary.count * 0.05))
    .sort(
      (a, b) =>
        distance(b) * Math.sqrt(b.weight) - distance(a) * Math.sqrt(a.weight),
    )[0];
  return [primary.rgb.join(", "), (secondary || primary).rgb.join(", ")];
}
