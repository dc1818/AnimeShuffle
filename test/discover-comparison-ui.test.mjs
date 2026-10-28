import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
test('comparison question renders covers only after both load; failed or missing covers hide it',async()=>{
 const dir=await mkdtemp(path.resolve('.comparison-test-'));
 await build({entryPoints:['src/components/DiscoverComparison.jsx'],outfile:path.join(dir,'component.mjs'),bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external'});
 const {DiscoverComparison}=await import(pathToFileURL(path.join(dir,'component.mjs')));
 const dom=new JSDOM('<div id="root"></div>');
 const prior={window:globalThis.window,document:globalThis.document,Image:globalThis.Image,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 let failure=false;
 globalThis.Image=class {naturalWidth=100;set src(value){queueMicrotask(()=>failure?this.onerror?.():this.onload?.());}};
 const random=Math.random;Math.random=()=>0.0001;
 const root=createRoot(document.getElementById('root'));
 const anime=id=>({id,title:'Anime '+id,image:'https://example.test/'+id+'.jpg'});
 try {
  await act(async()=>root.render(React.createElement(DiscoverComparison,{key:1,anime:anime(1),saved:[anime(2),anime(3)]})));
  let section=document.querySelector('.discover-comparison');
  assert.equal(section.style.visibility,'visible');
  assert.equal(section.textContent.includes('Where would you place this one?'),false);
  assert.equal(section.querySelectorAll('.comparison-choice img').length,2);
  failure=true;
  await act(async()=>root.render(React.createElement(DiscoverComparison,{key:2,anime:anime(1),saved:[anime(2),anime(3)]})));
  assert.equal(document.querySelector('.discover-comparison').style.visibility,'hidden');
  failure=false;
  await act(async()=>root.render(React.createElement(DiscoverComparison,{key:3,anime:anime(1),saved:[anime(2),{...anime(3),image:''}]})));
  assert.equal(document.querySelector('.discover-comparison').getAttribute('aria-hidden'),'true');
 } finally {await act(async()=>root.unmount());Math.random=random;Object.assign(globalThis,prior);dom.window.close();await rm(dir,{recursive:true,force:true});}
});
