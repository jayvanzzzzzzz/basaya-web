const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.cwd(),site=path.join(root,'build/student-usernames-release');
const base=fs.readFileSync('build/student-usernames-release-base.txt','utf8').trim();
const files=JSON.parse(fs.readFileSync('build/student-usernames-release-files.json'));
const ignore=cp.execFileSync('git',['show',base+':.gitignore'],{encoding:'utf8'});
fs.writeFileSync(path.join(site,'.gitignore'),ignore+'\noutput/student-usernames/\n');
if(!files.includes('.gitignore'))files.push('.gitignore');
for(const name of ['tools/student-accounts-tests.mjs','tools/username-auth-tests.mjs','tools/assign-student-usernames.mjs','build/student-accounts-qa.cjs']){
 const target=path.join(site,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(name,target);if(!files.includes(name))files.push(name);
}
fs.writeFileSync('build/student-usernames-release-files.json',JSON.stringify(files));
const env={...process.env,GIT_INDEX_FILE:path.join(root,'build/student-usernames-release.index')};
const git=(args,input)=>cp.execFileSync('git',['--git-dir='+path.join(root,'.git'),'--work-tree='+site,...args],{env,input,encoding:'utf8',maxBuffer:10000000}).trim();
git(['read-tree',base]);git(['add','--',...files]);
const tree=git(['write-tree']);
const commit=git(['commit-tree',tree,'-p',base],'Assign lowercase surname.firstname student usernames\n\nGenerate unique usernames during account creation, support dotted username login, show usernames in the admin directory, and include a repeatable migration with verification.\n');
fs.writeFileSync('build/student-usernames-release-commit.txt',commit+'\n');
console.log('Release commit '+commit);console.log(git(['diff-tree','--stat',base,commit]));
