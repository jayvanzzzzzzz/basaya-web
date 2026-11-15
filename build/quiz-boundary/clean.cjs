const fs=require('fs'),path=require('path'),crypto=require('crypto');
const file='app/src/main/res/layout/activity_quiz.xml';
const before=fs.readFileSync(path.join('C:/Projects/BaSaya',file));
const after=before.toString('utf8').replace(/^[ \t]+(?=\r?$)/gm,'');
fs.writeFileSync(path.join(__dirname,'files',file),after);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify([{file,before:hash(before),after:hash(Buffer.from(after))}],null,2));
