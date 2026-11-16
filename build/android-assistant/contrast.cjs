const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'staged/app/src/main/res');
for(const night of [false,true]) {
  const colors={};
  for(const folder of ['values',...(night?['values-night']:[])]) {
    const xml=fs.readFileSync(path.join(dir,folder,'colors_assistant.xml'),'utf8');
    for(const [,name,value] of xml.matchAll(/<color name="([^"]+)">#([A-Fa-f0-9]+)<\/color>/g)) colors[name]=value;
  }
  const luminance=name=>{
    const c=[0,2,4].map(i=>parseInt(colors[name].slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
    return c[0]*.2126+c[1]*.7152+c[2]*.0722;
  };
  for(const [fg,bg] of [['assistant_ink','assistant_surface'],['assistant_soft','assistant_chat_bg'],['assistant_muted','assistant_surface'],['assistant_on_primary','assistant_primary'],['assistant_primary','assistant_tint'],['assistant_ink','assistant_error_bg']]) {
    const a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    console.log(`${night?'dark':'light'} ${fg}/${bg}: ${ratio.toFixed(2)}:1`);
    if(ratio<4.5)process.exitCode=1;
  }
}
