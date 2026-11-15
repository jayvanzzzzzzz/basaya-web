const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const adb = 'C:/Users/Scean Andrei/AppData/Local/Android/Sdk/platform-tools/adb.exe';
function run(args) {return execFileSync(adb,args,{timeout:20000});}
if(process.argv.includes('--launch') && !process.argv.includes('--stay')) run(['shell','monkey','-p','com.example.basaya','-c','android.intent.category.LAUNCHER','1']);
const tap = process.argv.indexOf('--tap');
if(tap>=0) run(['shell','input','tap',process.argv[tap+1],process.argv[tap+2]]);
if(process.argv.includes('--scroll')) run(['shell','input','swipe','540','1940','540','800','450']);
run(['shell','uiautomator','dump','/sdcard/basaya-ui.xml']);
const xml=run(['exec-out','cat','/sdcard/basaya-ui.xml']).toString();
fs.writeFileSync(path.join(__dirname,'device.xml'),xml);
fs.writeFileSync(path.join(__dirname,'device.png'),run(['exec-out','screencap','-p']));
for(const node of xml.matchAll(/<node\b[^>]*>/g)) {
 const attrs=Object.fromEntries([...node[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
 if(attrs.text || attrs['content-desc']) console.log(JSON.stringify({text:attrs.text,label:attrs['content-desc'],bounds:attrs.bounds}));
}
