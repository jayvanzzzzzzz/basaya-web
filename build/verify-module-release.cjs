const fs=require('node:fs/promises'),path=require('node:path');
const normalize=s=>s.replaceAll('\r\n','\n').trim();
(async()=>{
 const files=JSON.parse(await fs.readFile('build/module-deploy/files.json','utf8'));
 const expected=new Map(await Promise.all(files.map(async name=>[name,normalize(await fs.readFile(path.join('build/module-deploy/release',name),'utf8'))])));
 for(let attempt=0;attempt<24;attempt++){
  const results=await Promise.all(files.map(async name=>{try{const response=await fetch('https://basaya.onrender.com/'+name+'?module-release='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});return {name,match:response.ok&&normalize(await response.text())===expected.get(name)}}catch{return {name,match:false}}}));
  const pending=results.filter(result=>!result.match).map(result=>result.name);
  if(!pending.length){console.log('PASS: all '+files.length+' module release files are live at https://basaya.onrender.com.');return;}
  console.log('Waiting for website deployment: '+(files.length-pending.length)+'/'+files.length+' files match.');
  if(attempt===23)throw Error('Deployment verification timed out. Pending files: '+pending.join(', '));
  await new Promise(resolve=>setTimeout(resolve,15000));
 }
})().catch(error=>{console.error(error.message);process.exitCode=1});
