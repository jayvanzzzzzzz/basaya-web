import {readFile,writeFile,mkdir} from 'node:fs/promises';
const base='https://basaya.onrender.com';
const files=['admin/views/create-student.js','admin/views/students.js','css/pages/admin-students.css','offline-shell.js'];
const normalize=value=>value.replaceAll('\r\n','\n').trim();
const results=await Promise.all(files.map(async name=>{
  const response=await fetch(`${base}/${name}?student-usernames=${Date.now()}`,{signal:AbortSignal.timeout(30000)});
  const actual=await response.text();
  const expected=await readFile(new URL(`../build/student-usernames-release/${name}`,import.meta.url),'utf8');
  return {name,status:response.status,matches:response.ok&&normalize(actual)===normalize(expected)};
}));
await mkdir('output/student-usernames',{recursive:true});
await writeFile('output/student-usernames/web-verification.json',JSON.stringify(results,null,2));
for(const result of results)console.log(`${result.matches?'PASS':'PENDING'} ${result.name}`);
if(results.some(result=>!result.matches))process.exitCode=2;
