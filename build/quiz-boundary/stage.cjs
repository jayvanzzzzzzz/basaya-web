const fs = require('fs'), path = require('path'), crypto = require('crypto');
const file = 'app/src/main/res/layout/activity_quiz.xml';
const before = fs.readFileSync(path.join('C:/Projects/BaSaya',file));
const source = before.toString('utf8').replace(/\r\n/g,'\n');
const start = source.indexOf('        <!-- Question & answers -->');
const end = source.indexOf('        <!-- Next -->',start);
if(start<0||end<0) throw Error('Missing quiz layout anchors');
const section = source.slice(start,end);
const opening = `        <!-- Question & answers -->
        <ScrollView
            android:layout_width="match_parent"
            android:layout_height="0dp"
            android:layout_weight="1"`;
if(!section.startsWith(opening)) throw Error('Quiz scroll layout changed');
let scroll = section.replace(opening,`        <ScrollView
            android:layout_width="match_parent"
            android:layout_height="match_parent"`).trimEnd();
scroll = scroll.split('\n').map(line=>'    '+line).join('\n');
const replacement = `        <!-- The viewport ends at the label row; content and animated shadows stay below it. -->
        <FrameLayout
            android:id="@+id/quizViewport"
            android:layout_width="match_parent"
            android:layout_height="0dp"
            android:layout_weight="1"
            android:clipChildren="true"
            android:clipToPadding="true"
            android:clipToOutline="true"
            android:outlineProvider="bounds">
${scroll}
        </FrameLayout>

`;
const after = source.slice(0,start)+replacement+source.slice(end);
const out=path.join(__dirname,'files',file);
fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,after);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify([{file,before:hash(before),after:hash(Buffer.from(after))}],null,2));
fs.writeFileSync(path.join(__dirname,'apply.cjs'),fs.readFileSync(path.join(__dirname,'../pagsasanay-ui/apply.cjs'),'utf8').replace('Pagsasanay UI files.','quiz boundary file.'));
console.log('Staged fixed quiz viewport; original content padding, margins and sizes retained.');
