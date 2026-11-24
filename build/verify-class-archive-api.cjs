const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=process.cwd(),stage=path.join(root,'build/class-archive-api'),team='team_yQ9vFBIcgHxnTD3wKRpn1LJU';
function api(endpoint){return JSON.parse(cp.execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-Command',`npx.cmd --yes vercel api '${endpoint}' --raw`],{cwd:stage,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20000000,timeout:60000}));}
(async()=>{
 const meta=api(`/v13/deployments/basaya-notify-api.vercel.app?teamId=${team}`);
 assert.equal(meta.readyState,'READY');assert.equal(meta.id,'dpl_GMuMAdWEDKTU4Hf9JwWZqKxVkqnY');
 const tree=api(`/v6/deployments/${meta.id}/files?teamId=${team}`),files=new Map();
 function visit(nodes,prefix=''){for(const node of nodes){const name=prefix+node.name;if(node.type==='directory')visit(node.children||[],name+'/');else files.set(name,node.uid);}}
 visit(tree.find(node=>node.name==='src').children);
 for(const file of ['handlers/content-lifecycle.js','lib/classContentArchive.js'])assert.equal(files.get(file),crypto.createHash('sha1').update(fs.readFileSync(path.join(stage,file))).digest('hex'));
 const base='https://basaya-notify-api.vercel.app/api/content-lifecycle';
 const headers={Origin:'http://localhost','Content-Type':'application/json'};
 for(const action of ['archive-class-content','restore-class-path']){
  const reply=await fetch(base,{method:'POST',headers,body:JSON.stringify({action}),signal:AbortSignal.timeout(30000)});
  assert.equal(reply.status,401);assert.equal(reply.headers.get('access-control-allow-origin'),'http://localhost');
 }
 const preflight=await fetch(base,{method:'OPTIONS',headers:{Origin:'http://localhost','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'},signal:AbortSignal.timeout(30000)});assert.equal(preflight.status,204);
 console.log('PASS: production alias points to the fixed deployment; both archive source files match; localhost CORS and authentication checks pass. No class data changed.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
