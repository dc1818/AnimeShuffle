/** Item correlations from stored site reactions. No account identities, lists or
 * individual choices leave this module. Sparse/constant samples stay unknown.
 * This is a small installation baseline, not a claim of statistical anonymity. */
export function communitySimilarities(rows, minimum = 5) {
  const users = new Map();
  for (const row of rows.slice(0, 10000)) {
    const id = Number(row.anime_id);
    let reaction;
    try {
      reaction =
        typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    } catch {
      continue;
    }
    const value = { good: 1, bad: -1, watch: 0.4, nope: -0.55 }[
      row.action || reaction?.action
    ];
    if (!Number.isSafeInteger(id) || id <= 0 || value === undefined) continue;
    if (!users.has(row.account_id)) {
      if (users.size >= 100) continue;
      users.set(row.account_id, new Map());
    }
    const user = users.get(row.account_id);
    if (user.size < 40 || user.has(id)) user.set(id, value);
  }
  const pairs = new Map();
  for (const user of users.values()) {
    const values = [...user].sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < values.length; i++)
      for (let j = i + 1; j < values.length; j++) {
        const [a, x] = values[i],
          [b, y] = values[j],
          key = `${a}:${b}`;
        const p = pairs.get(key) || {
          a,
          b,
          n: 0,
          x: 0,
          y: 0,
          xx: 0,
          yy: 0,
          xy: 0,
        };
        p.n++;
        p.x += x;
        p.y += y;
        p.xx += x * x;
        p.yy += y * y;
        p.xy += x * y;
        pairs.set(key, p);
      }
  }
  const result = {};
  for (const p of pairs.values()) {
    if (p.n < minimum) continue;
    const variance = (p.n * p.xx - p.x * p.x) * (p.n * p.yy - p.y * p.y);
    if (variance <= 1e-9) continue;
    const correlation = (p.n * p.xy - p.x * p.y) / Math.sqrt(variance);
    const affinity =
      (Math.max(-1, Math.min(1, correlation)) * p.n) / (p.n + 10);
    if (Math.abs(affinity) < 0.1) continue;
    for (const [a, b] of [
      [p.a, p.b],
      [p.b, p.a],
    ])
      (result[a] ||= []).push({
        id: b,
        affinity: Number(affinity.toFixed(3)),
        support: p.n,
      });
  }
  for (const id of Object.keys(result))
    result[id]
      .sort(
        (a, b) => Math.abs(b.affinity) - Math.abs(a.affinity) || a.id - b.id,
      )
      .splice(20);
  return result;
}
