const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.cwd(), dir=path.join(root,'build/learning-path-release'),site=path.join(dir,'site');
fs.mkdirSync(site,{recursive:true});
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:30e6}).replaceAll('\r\n','\n');
const local=name=>fs.readFileSync(path.join(root,name),'utf8').replaceAll('\r\n','\n');
const tracked=git('ls-tree','-r','--name-only','HEAD').trim().split('\n');
const roots=[...new Set(tracked.filter(name=>! /^(build|audit|output|\.agents|\.codex)\//.test(name)).map(name=>name.split('/')[0]))];
cp.execFileSync('git',['archive','HEAD','--output='+path.join(dir,'base.tar'),'--',...roots],{maxBuffer:1e6});
cp.execFileSync('tar',['-xf',path.join(dir,'base.tar'),'-C',site]);
const files=['admin/views/lessons.js','teacher/views/lessons.js','teacher/views/addLesson.js','teacher/views/classPage.js',
 'js/lessonWorkspace.js','js/moduleModel.js','js/modules.js','js/state.js','js/contentArchive.js','js/contentAvatar.js','js/contentVisibility.js','js/contentOperation.js','js/moduleOrderPreview.js','js/learningPaths.js','js/learningPathWorkspace.js','js/action-confirmation.js','css/pages/module-workspace.css',
 'notify-api/api/class-membership.js','notify-api/vercel.json','notify-api/handlers/content-lifecycle.js','notify-api/lib/contentLifecycle.js','notify-api/lib/contentVersioning.js','notify-api/lib/learningPaths.js','notify-api/handlers/lesson-deadlines.js',
 'docs/lesson-modules.md','tools/learning-path-tests.mjs','tools/learning-path-browser.cjs','tools/module-lessons-browser.cjs','tools/fixtures/content-versioning.js','tools/firestore-test-server.mjs','tools/content-archive-tests.mjs','tools/content-versioning-tests.mjs','tools/content-visibility-migrate.mjs'];
for(const name of files){const target=path.join(site,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,local(name));}
// Keep unrelated dictionary/class-rule changes out of this release.
let rules=local('build/module-deploy/active-firestore.rules'), current=local('firestore.rules');
function replaceBlock(start,end){const a=rules.indexOf(start==='    // Teachers author their own lessons; premade lessons are copied before editing.'?'    function ownsOrShared(d) {':start),b=rules.indexOf(end,a),c=current.indexOf(start==='    // Teachers author their own lessons; premade lessons are copied before editing.'?'    function ownsOrShared(d) {':start),d=current.indexOf(end,c);if([a,b,c,d].some(i=>i<0))throw Error('Rules block missing '+start);rules=rules.slice(0,a)+current.slice(c,d)+rules.slice(b);}
replaceBlock('    // Teachers author their own lessons; premade lessons are copied before editing.','    match /learnerNumbers/');
const marker='      // Teachers can add an existing lesson only to a class they own.';
replaceBlock(marker,'    match /classLessons/{linkId}');
fs.writeFileSync(path.join(site,'firestore.rules'),rules);files.push('firestore.rules');
cp.execFileSync(process.execPath,['tools/build-offline-shell.mjs'],{cwd:site,stdio:'inherit'});files.push('offline-shell.js');
fs.mkdirSync(path.join(site,'notify-api/.vercel'),{recursive:true});fs.copyFileSync(path.join(root,'notify-api/.vercel/project.json'),path.join(site,'notify-api/.vercel/project.json'));
// Check every relative runtime import against the actual release snapshot.
for(const folder of ['js','admin','teacher','notify-api']){const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()&&!entry.name.startsWith('.')?walk(path.join(dir,entry.name)):entry.isFile()&&entry.name.endsWith('.js')?[path.join(dir,entry.name)]:[]);for(const file of walk(path.join(site,folder))){for(const match of fs.readFileSync(file,'utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){if(!fs.existsSync(path.resolve(path.dirname(file),match[1].split('?')[0])))throw Error('Missing import '+match[1]+' from '+file);}}}
fs.writeFileSync(path.join(dir,'files.json'),JSON.stringify(files,null,2));
fs.writeFileSync(path.join(dir,'base-commit.txt'),git('rev-parse','HEAD').trim());
console.log('Prepared focused snapshot: '+files.length+' changed files, runtime imports verified.');

