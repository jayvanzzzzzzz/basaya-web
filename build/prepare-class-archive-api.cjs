const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=process.cwd(),stage=path.join(root,'build/class-archive-api'),team='team_yQ9vFBIcgHxnTD3wKRpn1LJU';
function api(endpoint){return JSON.parse(cp.execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-Command',`npx.cmd --yes vercel api '${endpoint}' --raw`],{cwd:path.join(root,'notify-api'),windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20000000}));}
const sha=bytes=>crypto.createHash('sha1').update(bytes).digest('hex');
const meta=api(`/v13/deployments/basaya-notify-api.vercel.app?teamId=${team}`);
if(meta.readyState!=='READY')throw Error('Production deployment is not ready.');
const tree=api(`/v6/deployments/${meta.id}/files?teamId=${team}`);
let count=0,downloaded=0;
function visit(nodes,prefix=''){
 for(const item of nodes){
  const name=prefix+item.name;
  if(item.type==='directory'){visit(item.children||[],name+'/');continue;}
  if(item.type!=='file'||!/^[a-f0-9]{40}$/.test(item.uid))throw Error('Unexpected production file');
  const target=path.resolve(stage,name);if(!target.startsWith(stage+path.sep))throw Error('Unsafe source path');
  const candidates=[];
  for(const base of ['notify-api','build/student-usernames-api','build/learning-path-release/site/notify-api'])try{candidates.push(fs.readFileSync(path.join(root,base,name)));}catch{}
  try{candidates.push(cp.execFileSync('git',['show','HEAD:notify-api/'+name],{cwd:root,stdio:['ignore','pipe','ignore']}));}catch{}
  const variants=candidates.flatMap(b=>[b,Buffer.from(b.toString().replaceAll('\r\n','\n')),Buffer.from(b.toString().replace(/\r?\n/g,'\r\n'))]);
  let bytes=variants.find(b=>sha(b)===item.uid);
  if(!bytes){const reply=api(`/v8/deployments/${meta.id}/files/${item.uid}?teamId=${team}&path=${encodeURIComponent(name)}`);if(typeof reply.data!=='string')throw Error('Missing production source');bytes=Buffer.from(reply.data,'base64');if(sha(bytes)!==item.uid)throw Error('Source hash mismatch');downloaded++;}
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);count++;
 }
}
const source=tree.find(item=>item.name==='src');if(!source?.children)throw Error('Production source missing');
visit(source.children);
const handler=path.join(stage,'handlers/content-lifecycle.js');let text=fs.readFileSync(handler,'utf8');
if(!text.includes("action === 'schedule-learning-path'"))throw Error('Expected learning-path handler missing');
text="import { archiveClassContent } from '../lib/classContentArchive.js';\n"+text;
text=text.replace('      : await changeContentLifecycle(database, uid, req.body);',"      : ['archive-class-content', 'restore-class-path'].includes(action) ? await archiveClassContent(database, uid, req.body)\n      : await changeContentLifecycle(database, uid, req.body);");
if(!text.includes("includes(action) ? await archiveClassContent"))throw Error('Archive dispatch was not added');
fs.writeFileSync(handler,text);fs.copyFileSync('notify-api/lib/classContentArchive.js',path.join(stage,'lib/classContentArchive.js'));
fs.mkdirSync(path.join(stage,'.vercel'),{recursive:true});fs.copyFileSync('notify-api/.vercel/project.json',path.join(stage,'.vercel/project.json'));
fs.writeFileSync('build/class-archive-api-baseline.json',JSON.stringify({id:meta.id,url:meta.url,files:count,downloaded,changed:['handlers/content-lifecycle.js','lib/classContentArchive.js']},null,2));
console.log(JSON.stringify({baseline:meta.id,files:count,downloaded,changed:['handlers/content-lifecycle.js','lib/classContentArchive.js'],stage}));
