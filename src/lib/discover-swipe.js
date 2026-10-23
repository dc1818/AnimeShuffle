// Deliberately follows Anime Shuffle's mapping, not dating-app conventions.
export function swipeChoice(dx, dy, threshold = 72) {
  const x = Math.abs(dx),
    y = Math.abs(dy);
  if (Math.max(x, y) < threshold || Math.max(x, y) < Math.min(x, y) * 1.25)
    return null;
  return x > y ? (dx < 0 ? "good" : "bad") : dy < 0 ? "watch" : "nope";
}

export const swipeLabels = {
  good: "← Good",
  bad: "Bad →",
  watch: "↑ Would watch",
  nope: "↓ Won’t watch",
};
