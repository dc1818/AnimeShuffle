import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEvidenceExport,collectEvidenceExport,evidenceVocabulary} from '../src/lib/evidence-export.js';
import {researchVocabulary,publicAnime} from '../lib/research-profiles.mjs';

test('recommendation export preserves priority, exact identity and vocabulary without private fields',()=>{
  const a={id:1,title:'Cowboy Bebop',englishTitle:'Cowboy Bebop',japaneseTitle:'カウボーイビバップ',year:1998,format:'tv',episodes:26,synopsis:'Public synopsis',token:'secret',listStatus:{status:'watching'}};
  const result=makeEvidenceExport([a,{id:2,title:'Other'},a]);
  assert.equal(result.count,2);assert.equal(result.profiles[0].malId,1);
  assert.equal(result.profiles[0].format,'TV');assert.equal(result.profiles[0].year,1998);
  assert.ok(result.profiles[0].aliases.includes(a.japaneseTitle));
  assert.equal(result.profiles[0].token,undefined);assert.equal(result.profiles[0].listStatus,undefined);
  assert.deepEqual(evidenceVocabulary,researchVocabulary);
  assert.equal(publicAnime(a).year,1998);assert.equal(publicAnime(a).japaneseTitle,a.japaneseTitle);
});
test('catalog export follows all pages beyond 1000',async()=>{
  const result=await collectEvidenceExport(async after=>({
    catalog:Array.from({length:100},(_,i)=>({id:after+i+1,title:`Anime ${after+i+1}`})),
    vocabulary:evidenceVocabulary,nextCursor:after<1400?after+100:null,
  }));
  assert.equal(result.count,1500);assert.equal(result.profiles.at(-1).malId,1500);
});
test('failed or nonadvancing pagination does not yield a partial export',async()=>{
  await assert.rejects(collectEvidenceExport(async()=>({catalog:[],vocabulary:[],nextCursor:0})),/advance/);
  await assert.rejects(collectEvidenceExport(async()=>{throw Error('offline');}),/offline/);
});
