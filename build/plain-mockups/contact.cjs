const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const root=path.join(__dirname,'features');
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1800,height:1700},deviceScaleFactor:1});
  let items='';
  for(const s of manifest){const data=await fs.readFile(path.join(root,s.role,s.file));items+=`<div><b>${s.role}: ${s.title}</b><img src="data:image/png;base64,${data.toString('base64')}"></div>`;}
  await page.setContent(`<style>body{margin:12px;background:#ddd;font:13px Arial;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}img{width:100%;display:block}b{display:block;padding:7px;background:white}div{border:1px solid #aaa;align-self:start}</style>${items}`);
  await page.screenshot({path:path.join(root,'contact-sheet.png'),fullPage:true});
 }finally{await browser.close();}
})();
