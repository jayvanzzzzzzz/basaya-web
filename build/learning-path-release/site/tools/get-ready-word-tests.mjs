import assert from 'node:assert/strict';
import { matchesGetReadyWord as matches, score } from '../notify-api/lib/pronunciationScoring.js';
const compound='maitim-ang-budhi';
const accepted=[
  [compound,'Maitim ang buddhi'],[compound,'maitim-ang-budhi'],[compound,'MAITIM ANG BUDHI.'],
  [compound,'maitimangbudhi'],[compound,'Maitim—ang—budhi'],[compound,'maitim ang budhi po'],
  [compound,'Ang maitim ang buddhi po.'],[compound,'mai tim ang budhi'],
  ['araw-araw','araw araw'],['bata-bata','bata bata'],["iba’t-iba","iba’t iba"],
  ['bagong-bago','baggong bago'],['magandang','maggandang'],['budhi','buddhi'],
  ['bahay','ang bahay'],['babae','babai'],['puno','punu'],['missa','misssa'],
];
const rejected=[
  [compound,'maitim'],[compound,'ang budhi'],[compound,'maitim budhi'],[compound,'maitim ang'],
  [compound,'maitim ng budhi'],[compound,'budhi ang maitim'],[compound,'mabait ang bata'],
  [compound,'maitim ang budi'],[compound,'maitim ang buti'],[compound,'maitim ang budddhi'],
  [compound,'maitim ang buudhi'],[compound,'maittim ang buddhi'],[compound,'maitimangbudhipo'],
  ['araw-araw','araw'],['bata-bata','bata'],['bagong-bago','bago bago'],
  ['magandang','magandamg'],['budhi','buti'],['missa','misa'],['bata','batang'],
  ['bata','bataa'],['bata','batt-ta'],['','anything'],['bahay',''],
];
for(const [target,heard]of accepted)assert.equal(matches(target,heard),true,`${target} should accept ${heard}`);
for(const [target,heard]of rejected)assert.equal(matches(target,heard),false,`${target} should reject ${heard}`);
for(let omitted=0;omitted<3;omitted++)assert.equal(matches(compound,['maitim','ang','budhi'].filter((_,i)=>i!==omitted).join(' ')),false);
assert.equal(score('budhi',['buddhi']).band,'try-again','Legacy graded scoring is unchanged');
assert.equal(score('magandang',['magandamg']).band,'okay','Legacy grading retains its existing rules');
console.log(`PASS: ${accepted.length+rejected.length+5} compound/word checks; spaces and hyphens, all parts in order, one duplicated consonant, no missing parts or arbitrary near matches`);
