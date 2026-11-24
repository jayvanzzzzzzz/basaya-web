const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=process.cwd(),stage=path.join(root,'build/student-usernames-api'),team='team_yQ9vFBIcgHxnTD3wKRpn1LJU';
const meta=JSON.parse(fs.readFileSync('build/student-usernames-deployment.json','utf8').replace(/^\uFEFF/,''));
function api(endpoint){return JSON.parse(cp.execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-Command',`npx.cmd --yes vercel api '${endpoint}' --raw`],{cwd:path.join(root,'notify-api'),windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20000000}));}
const sha=bytes=>crypto.createHash('sha1').update(bytes).digest('hex');
const tree=api(`/v6/deployments/${meta.id}/files?teamId=${team}`);
fs.writeFileSync('build/student-usernames-production-files.json',JSON.stringify(tree));
let count=0,restored=0;
function visit(nodes,prefix=''){
 for(const item of nodes){
  const name=prefix+item.name;
  if(item.type==='directory'){visit(item.children||[],name+'/');continue;}
  if(item.type!=='file'||!/^[a-f0-9]{40}$/.test(item.uid))throw Error('Unexpected production file');
  const target=path.resolve(stage,name);if(!target.startsWith(stage+path.sep))throw Error('Unsafe source path');
  const candidates=[];
  try{candidates.push(fs.readFileSync(path.join(root,'notify-api',name)));}catch{}
  try{candidates.push(cp.execFileSync('git',['show','HEAD:notify-api/'+name],{cwd:root,stdio:['ignore','pipe','ignore']}));}catch{}
  const variants=candidates.flatMap(b=>[b,Buffer.from(b.toString().replaceAll('\r\n','\n')),Buffer.from(b.toString().replace(/\r?\n/g,'\r\n'))]);
  let bytes=variants.find(b=>sha(b)===item.uid);
  if(!bytes){const reply=api(`/v8/deployments/${meta.id}/files/${item.uid}?teamId=${team}&path=${encodeURIComponent(name)}`);if(typeof reply.data!=='string')throw Error('Missing production source');bytes=Buffer.from(reply.data,'base64');if(sha(bytes)!==item.uid)throw Error('Source hash mismatch');restored++;}
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);count++;
 }
}
visit(tree.find(item=>item.name==='src').children);
for(const name of ['lib/studentAccounts.js','lib/studentUsernames.js','lib/usernames.js','handlers/username.js','handlers/student-accounts.js'])fs.copyFileSync(path.join(root,'notify-api',name),path.join(stage,name));
fs.mkdirSync(path.join(stage,'.vercel'),{recursive:true});fs.copyFileSync('notify-api/.vercel/project.json',path.join(stage,'.vercel/project.json'));
console.log(JSON.stringify({production:meta.id,files:count,restored,stage}));
