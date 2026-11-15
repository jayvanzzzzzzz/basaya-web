const fs = require('fs'), path = require('path'), crypto = require('crypto');
const file = 'app/src/main/res/layout/activity_quiz.xml';
const before = fs.readFileSync(path.join('C:/Projects/BaSaya',file));
const source = before.toString('utf8');
let matches = 0;
const after = source.replace(/<ScrollView\b[^>]*>/g, tag => {
    matches++;
    if (!tag.includes('android:clipChildren="false"') || !tag.includes('android:clipToPadding="false"'))
        throw Error('Scroll clipping attributes changed; inspect again');
    return tag.replace('android:clipChildren="false"','android:clipChildren="true"')
        .replace('android:clipToPadding="false"','android:clipToPadding="true"');
});
if (matches !== 1) throw Error('Expected exactly one quiz scroll viewport');
const out = path.join(__dirname,'files',file);
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,after);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify([{file,before:hash(before),after:hash(Buffer.from(after))}],null,2));
const apply = fs.readFileSync(path.join(__dirname,'../pagsasanay-ui/apply.cjs'),'utf8')
    .replace('Pagsasanay UI files.','quiz scroll layout file.');
fs.writeFileSync(path.join(__dirname,'apply.cjs'),apply);
console.log('Staged quiz viewport clipping; fixed labels and inner animation spacing preserved.');
