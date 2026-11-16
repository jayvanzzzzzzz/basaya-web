const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..'),stage=path.join(base,'staged/app/src/main');
const files={
 'AssistantActivity.kt':'java/ph/basaya/app/ui/assistant/AssistantActivity.kt',
 'activity_assistant.xml':'res/layout/activity_assistant.xml',
 'colors_assistant.xml':'res/values/colors_assistant.xml',
 'colors_assistant_night.xml':'res/values-night/colors_assistant.xml',
 'strings_assistant.xml':'res/values/strings_assistant.xml',
 ...Object.fromEntries(['bg_assistant_input','bg_assistant_question','bg_assistant_send','bg_assistant_badge','ic_assistant_info'].map(name=>[name+'.xml','res/drawable/'+name+'.xml']))
};
for(const [source,target] of Object.entries(files))fs.copyFileSync(path.join(__dirname,source),path.join(stage,target));
// Legacy resources are kept compatible while the new screen no longer references them.
for(const folder of ['values','values-night']) {
 const previous=fs.readFileSync('C:/Projects/BaSaya/app/src/main/res/'+folder+'/colors_assistant.xml','utf8');
 const nextFile=path.join(stage,'res',folder,'colors_assistant.xml');
 let next=fs.readFileSync(nextFile,'utf8');
 const names=new Set([...next.matchAll(/name="([^"]+)"/g)].map(m=>m[1]));
 const retained=[...previous.matchAll(/<color name="([^"]+)">[^<]+<\/color>/g)].filter(m=>!names.has(m[1])).map(m=>m[0]);
 next=next.replace('</resources>',retained.join('\n')+'\n</resources>');fs.writeFileSync(nextFile,next);
}
console.log('Prepared native web-parity screen.');
