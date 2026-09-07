import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const sha=p=>createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
let passed=0;
function check(label,fn){fn();passed++;console.log('PASS '+label);}
const context={window:{}};
for(const file of ['lyrian-data.js','lyrian-detail-data.js'])vm.runInNewContext(read('assets/versions/0.13.2/'+file),context);
vm.runInNewContext(read('assets/versions/manifest.js'),context);
const data=context.window.LYRIAN_DATA,detail=context.window.LYRIAN_DETAIL_DATA;
const manifest=json('assets/versions/manifest.json');
const compact=x=>String(x??'').replace(/\s+/g,' ').trim();
check('source, bundles, JSON/JS manifests and index all default to 0.13.2',()=>{
 assert.equal(json('data/angelssword/manifest.json').latestVersion,'0.13.2');
 assert.equal(data.version,'0.13.2');assert.equal(detail.version,'0.13.2');
 assert.equal(manifest.defaultVersion,'0.13.2');assert.equal(manifest.latestKnownVersion,'0.13.2');
 assert.equal(JSON.stringify(context.window.LYRIAN_VERSION_MANIFEST),JSON.stringify(manifest));
 for(const f of ['lyrian-data.js','lyrian-detail-data.js'])assert.ok(read('index.html').includes('assets/versions/0.13.2/'+f+'?v='));
});
const historical=json('data/angelssword/baseline-version-hashes.json');
check('four historical rules versions remain byte-identical',()=>{
 assert.equal(Object.keys(historical).length,8);
 for(const [p,hash]of Object.entries(historical))assert.equal(sha(p),hash,p);
 for(const version of ['0.12.5','0.12.6','0.13.0','0.13.1'])assert.ok(manifest.versions.some(x=>x.id===version));
});
check('wrong explicit version fails before any version-manifest/bundle writes',()=>{
 const before={};for(const p of [...Object.keys(historical),'assets/versions/manifest.js','assets/versions/manifest.json','assets/versions/0.13.2/lyrian-data.js','assets/versions/0.13.2/lyrian-detail-data.js'])before[p]=sha(p);
 const run=spawnSync(process.execPath,['scripts/build-version-assets.mjs','0.13.1'],{cwd:root,encoding:'utf8'});
 assert.notEqual(run.status,0);assert.match(run.stderr,/does not match captured source/);
 for(const [p,hash]of Object.entries(before))assert.equal(sha(p),hash,p);
});
const pullCode=read('scripts/pull-angels-sword-data.js');
const pullContext={require:createRequire(path.join(root,'scripts/pull-angels-sword-data.js')),process,console,Buffer};
vm.runInNewContext(pullCode.slice(0,pullCode.indexOf('main().catch'))+'\nglobalThis.decode = decodeBase64Html;',pullContext);
check('plain Unicode HTML and legacy base64 both enrich readable text',()=>{
 const legacy=Buffer.from('<p>Legacy spell &amp; ability</p>').toString('base64');
 const result=pullContext.decode({description:'<p>“Flight” … — &amp; Safe</p>',guide:legacy});
 assert.equal(result.descriptionHtml,'<p>“Flight” … — &amp; Safe</p>');
 assert.equal(result.descriptionText,'“Flight” … — & Safe');
 assert.equal(result.guideText,'Legacy spell & ability');
  assert.equal(result.guide,legacy);
 const table=pullContext.decode({description:'<table><tr><th>Rarity</th><th>Fire</th></tr><tr><td>Common</td><td>50</td></tr></table>'});
 assert.equal(compact(table.descriptionText),'Rarity Fire Common 50');
 const materials=data.items.find(x=>x.name==='Alchemy Materials'||x.name==='Alchemical Materials');
 assert.ok(materials,'official alchemy materials record exists');
 assert.match(materials.description,/Rarity\s+Fire/,'actual material-table header cells remain separated');
});
let buildCode=read('scripts/build-version-assets.mjs').replace(/^import .*;\r?\n/gm,'').replace('const __dirname = path.dirname(fileURLToPath(import.meta.url));','const __dirname = SCRIPT_DIR;');
buildCode=buildCode.slice(0,buildCode.indexOf('main().catch'))+'\nglobalThis.decodeField=maybeDecodeBase64Html; globalThis.verifyImage=verifyImageBytes;';
const buildContext={SCRIPT_DIR:path.join(root,'scripts'),path,Buffer,createHash,console};vm.runInNewContext(buildCode,buildContext);
check('plain None remains readable and short old base64 placeholders decode',()=>{
 assert.equal(buildContext.decodeField('None'),'None');assert.equal(buildContext.decodeField('LQ=='),'-');assert.equal(buildContext.decodeField('Tm9uZQ=='),'None');
});
check('HTTP 200 HTML disguised as a cached image is rejected',()=>{
 assert.throws(()=>buildContext.verifyImage(Buffer.from('<html>not an image error</html>'),'text/html','fixture'),/Invalid image/);
 assert.throws(()=>buildContext.verifyImage(Buffer.alloc(64),'image/webp','fixture'),/Invalid image/);
});
check('all four new classes have complete descriptions, key abilities and four progression abilities',()=>{
 for(const name of ['Fusilier','Manifestor','Mystic Eyes of Petrification','Still Stone Testament']){
  const row=detail.classes.find(x=>x.name===name);assert.ok(row,name);assert.ok(row.descriptionText.length>50,name);assert.ok(row.descriptionHtml.startsWith('<'),name);assert.ok(row.keyAbility.name,name);assert.equal(row.abilities.length,4,name);for(const a of row.abilities)assert.ok(a.descriptionText,a.name);
 }
 assert.equal(data.classes.length,185);assert.equal(data.abilities.length,958);
});
check('Pigfolk traits and five new keywords survive source-to-runtime conversion',()=>{
 const pig=detail.ancestries.find(x=>x.name==='Pigfolk');assert.ok(pig);assert.deepEqual(Array.from(pig.traits,x=>x.name).sort(),['Break Piggy Bank','Eat Anything','Mercantile'].sort());for(const t of pig.traits)assert.ok(t.descriptionText);
 for(const name of ['Calcification','Dual Wield','Mandate','Petrify','Salvo'])assert.ok(data.keywords.some(x=>x.name===name&&x.description),name);
});
check('class access expansions and Armiger Focus/Power choices are preserved',()=>{
 assert.match(data.classes.find(x=>x.name==='Deadeye').requirements,/Harrier/);
 for(const n of ['Venomancer','Venomblade'])assert.match(data.classes.find(x=>x.name===n).requirements,/Medic/);
 assert.equal(data.classes.find(x=>x.name==='Armiger').soul,'You gain +1 to Focus, Power, Agility or Toughness.');
 assert.match(data.breakthroughs.find(x=>x.name==='Rapid Flash (High Fae)').requirements,/Fae Flash II/);
});
check('all nine Demon lineage references preserve full source ability text',()=>{
 const source=json('data/angelssword/joined/primary_race_details_resolved.json').find(x=>x.primaryRaceId==='demon');
 const row=detail.races.find(x=>x.id==='demon');assert.equal(Object.keys(row.lineageChoices).length,9);
 for(const [code,choice]of Object.entries(source.lineageChoices)){const a=row.lineageChoices[code].abilityRef;assert.ok(a,code);assert.equal(a.name,choice.abilityRef.name);assert.equal(compact(a.descriptionText),compact(choice.abilityRef.descriptionText));assert.ok(a.descriptionText.length>10,code);}
});
check('all class/race/ancestry rich descriptions and referenced ability text reach runtime',()=>{
 for(const [family,sourceFile,idField]of [['classes','class_details_resolved','classId'],['races','primary_race_details_resolved','primaryRaceId'],['ancestries','ancestry_details_resolved','ancestryId']]){
  const rows=json('data/angelssword/joined/'+sourceFile+'.json');assert.equal(detail[family].length,rows.length);
  for(const source of rows){const out=detail[family].find(x=>x.id===source[idField]);assert.ok(out,source.name);assert.equal(compact(out.descriptionText),compact(source.descriptionText??source.description),source.name);assert.equal(out.descriptionHtml,source.descriptionHtml||'',source.name);
   for(const a of [...(out.abilities||[]),...(out.traits||[])])assert.ok(a.name&&a.descriptionText,a.name);
  }
 }
});
check('Warning Shot new slug preserves stable indexId for save migrations',()=>{
 const id='38d587b1-7ed6-4c69-a0a1-a543e49b08d9';const out=data.abilities.find(x=>x.indexId===id);assert.ok(out);assert.equal(out.id,'warning-shot');assert.match(out.requirement,/pistol/);
 const old={window:{}};vm.runInNewContext(read('assets/versions/0.13.1/lyrian-data.js'),old);assert.ok(old.window.LYRIAN_DATA.abilities.some(x=>x.id==='warning_shot'));
});
check('Flight is 0 RP, Elemental Strike and nonstacking elixirs contain new rules',()=>{
 const flight=data.abilities.find(x=>x.name==='Flight');assert.equal(flight.apCost,'');assert.equal(flight.rpCost,'0');assert.ok(flight.keywords.includes('Rage'));
 const elemental=data.abilities.find(x=>x.name==='Elemental Strike');assert.match(elemental.description,/Sundered/);assert.match(elemental.description,/Power \+ 3/);
 assert.match(data.items.find(x=>x.name==='Bear Elixir').description,/another bear elixir has no effect/);
 assert.match(data.items.find(x=>x.name==='Blood Elixir').description,/If you lost max HP/);
 assert.match(data.items.find(x=>x.name==='Wolf').description,/HP: 25/);
});
check('generated data contains no remote asset URLs and every cached image exists',()=>{
 let imageCount=0;function walk(x,key=''){if(typeof x==='string'){assert.ok(!/https?:\/\//.test(x),'remote URL in '+key);if(x.startsWith('assets/item-images/0.13.2/')){imageCount++;assert.ok(fs.statSync(path.join(root,x)).size>32,x);}}else if(x&&typeof x==='object')for(const[k,v]of Object.entries(x))walk(v,k);}
 walk(data);walk(detail);assert.equal(imageCount,880);
 const audit=read('data/angelssword/image-cache-audit.jsonl').trim().split('\n').map(x=>JSON.parse(x));assert.ok(audit.length>100);assert.ok(audit.every(x=>x.status===200&&!x.error&&x.sha256));
 const decoded=json('data/angelssword/image-decode-validation.json');assert.equal(decoded.decoded,880);assert.equal(decoded.errors.length,0);
});
console.log(`Passed ${passed} rules 0.13.2 data gates.`);
