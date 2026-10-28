import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeComparisons, comparisonChoices} from '../src/lib/discover-comparison.js';
import {buildTaste} from '../src/lib/recommend.js';
const anime = id => ({id,title:'Anime '+id,genres:['Action']});
test('comparisons exclude self and need enough distinct saved titles for each variant',()=>{
 assert.equal(comparisonChoices(anime(1),[anime(1)],0),null);
 assert.equal(comparisonChoices(anime(1),[anime(2),anime(2)],3).kind,0);
 for(let i=0;i<30;i++) assert.equal(comparisonChoices(anime(1),[anime(2),anime(3)],i).kind,[0,2,3][i%3]);
});
test('bounded interest is never a dislike, rating or accumulating duplicate vote',()=>{
 const comparisons=normalizeComparisons([{anime:anime(2)}, {anime:anime(2)}, {anime:{id:-1,title:'bad'}}]);
 assert.equal(comparisons.length,1);
 const taste=buildTaste({},[],{comparisons},[],false);
 assert.equal(taste.records.get(2).enjoyment,0);
 assert.equal(taste.records.get(2).interest,0.12);
 const disliked=buildTaste({2:{anime:anime(2),action:'bad'}},[],{comparisons},[],false);
 assert.equal(disliked.records.get(2).enjoyment,-1);
 assert.equal(disliked.records.get(2).interest,0);
});
