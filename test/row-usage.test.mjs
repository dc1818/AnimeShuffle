import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("real SQLite row measurements survive checkpoints, distinguish scans from indexed reads, and resume next UTC day", async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
    import { DurableObject } from 'cloudflare:workers';
    import { createRowUsage } from './lib/row-usage.mjs';
    export class UsageProbe extends DurableObject {
      constructor(ctx, env) { super(ctx,env); this.raw=ctx.storage; this.clock=1800000000000; this.open(); }
      open(){ this.meter=createRowUsage(this.raw,{now:()=>this.clock,backgroundReads:100}); }
      async fetch(req){
        const action=new URL(req.url).pathname;
        const sql=this.meter.storage.sql;
        if(action==='/seed'){
          sql.exec('CREATE TABLE sample(id INTEGER PRIMARY KEY,value TEXT)');
          this.raw.transactionSync(()=>{ for(let i=0;i<1000;i++) sql.exec('INSERT INTO sample VALUES (?,?)',i,'PRIVATE_SENTINEL_'+i); });
        }
        if(action==='/scan') await this.meter.run('Lookup', async()=>{ sql.exec('SELECT id FROM sample WHERE value=?','PRIVATE_SENTINEL_999'); });
        if(action==='/index') sql.exec('CREATE INDEX sample_value ON sample(value)');
        if(action==='/restart'){this.meter.flush(true);this.open();}
        if(action==='/tomorrow') this.clock+=86400000;
        return Response.json({...this.meter.diagnostics(),allowed:this.meter.allowed()});
      }
    }
    export default {fetch:(req,env)=>env.PROBE.get(env.PROBE.idFromName('test')).fetch(req)};
  `,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "es2022",
    external: ["cloudflare:workers"],
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      host: "127.0.0.1",
      inspectorHost: "127.0.0.1",
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { PROBE: { className: "UsageProbe", useSQLite: true } },
    }),
  );
  const call = async (path) => {
    const r = await mf.dispatchFetch("https://example.test" + path);
    assert.equal(r.status, 200);
    return r.json();
  };
  try {
    const seeded = await call("/seed");
    assert.equal(seeded.measured, true);
    assert.ok(seeded.rowsWritten >= 1000);
    const scanned = await call("/scan");
    assert.ok(scanned.rowsRead - seeded.rowsRead >= 1000);
    assert.equal(scanned.allowed, false);
    assert.doesNotMatch(JSON.stringify(scanned), /PRIVATE_SENTINEL/);
    const restarted = await call("/restart");
    assert.ok(restarted.rowsRead >= scanned.rowsRead);
    await call("/index");
    const tomorrow = await call("/tomorrow");
    assert.equal(tomorrow.allowed, true);
    const indexed = await call("/scan");
    assert.ok(indexed.rowsRead - tomorrow.rowsRead < 10);
    assert.equal(indexed.allowed, true);
  } finally {
    await mf.dispose();
  }
});
