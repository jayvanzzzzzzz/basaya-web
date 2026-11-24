const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.cwd(),dir=path.join(root,'build/learning-path-release'),site=path.join(dir,'site');
const base=fs.readFileSync(path.join(dir,'base-commit.txt'),'utf8').trim(), files=JSON.parse(fs.readFileSync(path.join(dir,'files.json'),'utf8'));
const env={...process.env,GIT_INDEX_FILE:path.join(dir,'release.index')};
const git=(args,input)=>cp.execFileSync('git',['--git-dir='+path.join(root,'.git'),'--work-tree='+site,...args],{env,input,encoding:'utf8',maxBuffer:20e6}).trim();
git(['read-tree',base]);git(['add','--',...files]);
const tree=git(['write-tree']);const commit=git(['commit-tree',tree,'-p',base], 'Add learning paths with shared deadlines and customized module assignment\n\nInclude guarded archive/delete, audited admin moderation, versioned lesson/module copies, and focused regression tests.\n');
fs.writeFileSync(path.join(dir,'release-commit.txt'),commit+'\n');
console.log('Isolated release commit: '+commit);console.log(git(['diff-tree','--stat',base,commit]));
