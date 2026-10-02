/** Account-scoped outbox. Send per-anime changes, never replace another device's whole list.
 * Failed writes stay in browser storage and are retried on focus, reconnect, or Retry sync.
 * Concurrent edits to the same anime use the last successfully submitted action.
 */
export function createCloudSync({ api, storage, key, onRemote, onStatus }) {
  let pending = {},
    settings = null,
    revision = 0,
    last = { reactions: {}, settings: {} },
    running = null,
    disposed = false;
  try {
    const saved = JSON.parse(storage.getItem(key) || "{}");
    pending = saved.pending || {};
    settings = saved.settings || null;
  } catch {}
  function save() {
    try {
      storage.setItem(key, JSON.stringify({ pending, settings }));
    } catch {
      onStatus(
        "Pending changes could not be backed up in this browser. Keep this tab open and retry sync.",
      );
    }
  }
  function apply(remote) {
    // A background GET can finish after a newer local write was acknowledged.
    // Do not roll the account back to that older revision.
    if (remote.revision < revision) return;
    const reactions = { ...remote.reactions };
    for (const [id, value] of Object.entries(pending)) {
      if (value === null) delete reactions[id];
      else reactions[id] = value;
    }
    const merged = {
      ...remote,
      reactions,
      settings: settings || remote.settings,
    };
    revision = remote.revision;
    last = { reactions: merged.reactions, settings: merged.settings };
    if (!disposed) onRemote(merged);
  }
  async function refresh() {
    apply(await api("/api/account/state"));
  }
  async function flush() {
    if (disposed) return;
    if (running) return running;
    running = (async () => {
      let conflicts = 0;
      while (!disposed && (Object.keys(pending).length || settings)) {
        const batch = Object.entries(pending).slice(0, 100),
          sentSettings = settings;
        try {
          const result = await api("/api/account/state", {
            revision,
            changes: batch.map(([id, reaction]) => ({
              id: Number(id),
              reaction,
            })),
            ...(sentSettings ? { settings: sentSettings } : {}),
          });
          revision = result.revision;
          for (const [id, value] of batch)
            if (pending[id] === value) delete pending[id];
          if (settings === sentSettings) settings = null;
          save();
          conflicts = 0;
        } catch (error) {
          if (error.code === "sync_conflict" && conflicts++ < 3) {
            await refresh();
            continue;
          }
          throw error;
        }
      }
      if (!disposed) onStatus("");
    })()
      .catch((error) => {
        if (!disposed)
          onStatus(
            "Changes are saved on this device but have not synced. " +
              error.message,
          );
        throw error;
      })
      .finally(() => {
        running = null;
      });
    return running;
  }
  return {
    async initialize() {
      await refresh();
      await flush();
    },
    queue(snapshot) {
      if (disposed) return;
      const ids = new Set([
        ...Object.keys(last.reactions),
        ...Object.keys(snapshot.reactions),
      ]);
      for (const id of ids)
        if (
          JSON.stringify(last.reactions[id]) !==
          JSON.stringify(snapshot.reactions[id])
        )
          pending[id] = snapshot.reactions[id] || null;
      if (JSON.stringify(last.settings) !== JSON.stringify(snapshot.settings))
        settings = { ...snapshot.settings };
      last = { reactions: snapshot.reactions, settings: snapshot.settings };
      save();
      void flush().catch(() => {});
    },
    async refresh() {
      await flush();
      if (!disposed) await refresh();
    },
    flush,
    dispose() {
      disposed = true;
    },
  };
}
