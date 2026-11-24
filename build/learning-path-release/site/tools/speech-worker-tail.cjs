// Read-only Worker diagnostics. Never print request headers, audio or transcripts.
const {spawn}=require('node:child_process');
const path=require('node:path');
const child=spawn('npx.cmd',['--yes','wrangler','tail','basaya-stt','--format','json'],{cwd:path.resolve(__dirname,'../cloudflare/readings'),shell:true,windowsHide:true,stdio:['ignore','pipe','pipe']});
const redact=value=>String(value).replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted token]').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted key]');
let buffer='',depth=0,quoted=false,escaped=false;
function show(raw){
  try{
    const event=JSON.parse(raw);
    console.log(JSON.stringify({time:event.eventTimestamp,outcome:event.outcome,path:event.event?.request?.url?new URL(event.event.request.url).pathname:undefined,status:event.event?.response?.status,elapsedMs:event.eventTimestamp?Date.now()-event.eventTimestamp:undefined,exceptions:(event.exceptions||[]).map(error=>({name:error.name,message:redact(error.message)})),errors:(event.logs||[]).filter(log=>log.level==='error').map(log=>(log.message||[]).map(redact))}));
  }catch{}
}
child.stdout.on('data',chunk=>{for(const char of chunk.toString()){
  if(!depth){if(char!=='{')continue;buffer='';quoted=false;escaped=false}
  buffer+=char;
  if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false}
  else if(char==='"')quoted=true;else if(char==='{')depth++;else if(char==='}'&&--depth===0){show(buffer);buffer=''}
}});
child.stderr.on('data',chunk=>{const text=redact(chunk.toString());if(!text.includes('Authorization'))process.stderr.write(text)});
child.on('exit',code=>{process.exitCode=code||0});
process.on('SIGINT',()=>{child.kill();process.exit(0)});
