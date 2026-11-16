const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.join(__dirname,'features');
const btn=(text,solid=false)=>`<span class="button ${solid?'solid':''}">${text}</span>`;
const small=text=>`<span class="outline">${text}</span>`;
const field=(name,value='Enter '+name.toLowerCase(),tall=false)=>`<label>${name}</label><div class="input ${tall?'tall':''}">${value}</div>`;
const tabs=items=>`<div class="tabs">${items.map((x,i)=>`<span class="${i===0?'selected':''}">${x}</span>`).join('')}</div>`;
const table=(headers,rows)=>`<table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const panel=(title,body)=>`<section class="panel"><h3>${title}</h3>${body}</section>`;
const cols=(left,right)=>`<div class="columns">${left}${right}</div>`;
const tools=(query,action='')=>`<div class="sectionhead"><div class="search">${query}</div>${action}</div>`;
const stats=labels=>`<div class="stats">${labels.map(x=>`<div class="stat"><strong>—</strong><span>${x}</span></div>`).join('')}</div>`;
const row=(title,sub,action)=>`<div class="row"><div>${title}<small>${sub}</small></div>${small(action)}</div>`;
const screens=[];
function add(role,file,title,description,body,action=''){screens.push({role,file,title,description,body,action});}
const sample=['A','B','C'];
add('Admin','01-teacher-accounts','Teacher accounts','Manage teacher access and assigned classes.',
 tools('Search teacher name...',btn('+ Add teacher',true))+table(['Teacher','Email address','Actions'],sample.map(x=>['Teacher '+x,'teacher@example.com',small('Edit')+' '+small('Assign classes')+' '+small('Reset password')+' '+small('Remove')]))+'<div class="note">Select a teacher to update their details or manage account access.</div>');
add('Admin','02-create-teacher','Create teacher account','Enter the teacher details and initial password.',
 `<div class="formwide">${field('Full name')}${field('Title','None / Mr. / Ms. / Mrs. / Ma’am / Sir')}${field('Email address')}${field('Initial password','Enter an initial password')}<div class="actions">${btn('Create teacher',true)} ${btn('Cancel')}</div></div>`);
add('Admin','03-student-accounts','Student accounts','Find students and help with password access.',
 tabs(['All students','Class A','Class B','No class yet'])+tools('Search name, email or class...')+table(['Student','Email address','Class','Actions'],sample.map(x=>['Student '+x,'student@example.com','Class '+x,small('Send reset link')+' '+small('Set temporary password')])));
add('Admin','04-class-management','Class management','Organize classes, assign teachers and review deletion requests.',
 tabs(['All grades','Grade 7','Grade 8'])+tools('Search class name...')+table(['Class','Teacher','Created','Actions'],[['Class A','Teacher A','Date',small('Change teacher')+' '+small('Edit')],['Class B','Not assigned','Date',small('Assign teacher')+' '+small('Edit')],['Class C','Teacher B','Date',small('Edit')+' '+small('Delete')]])+panel('Deletion request',row('Class C','Teacher requested deletion', 'Review request')));
add('Admin','05-lesson-library','Lesson library','Create, preview and organize learning materials.',
 tools('Search lesson title...',btn('+ Create lesson',true))+tabs(['All levels','Beginner','Intermediate','Advanced'])+table(['Lesson title','Difficulty','Actions'],sample.map((x,i)=>['Lesson '+x,['Beginner','Intermediate','Advanced'][i],small('Preview')+' '+small('Edit')+' '+small('Delete')])));
add('Admin','06-lesson-editor','Lesson editor','Build the lesson and its learning activities.',
 `<div class="editor"><aside class="panel">${['Lesson basics','Lecture pages','Game levels','Word activity','Pronunciation','Quiz'].map((x,i)=>`<div class="editorstep ${!i?'chosen':''}">${x}</div>`).join('')}</aside><section class="panel"><h3>Lesson basics</h3>${field('Lesson title')}${field('Difficulty','Select level')}${field('Description','What will the learner study?',true)}<div class="actions">${btn('Save lesson',true)} ${btn('Preview')} ${btn('Cancel')}</div></section></div>`);
function dictionary(role){return tools('Search a Filipino word...',btn('+ Add word',true))+tabs(['All words','A','B','D','E','G','H','I','K','L','M','N','P','R','S','T','U','W','Y'])+cols(table(['Word','Part of speech','Actions'],['Word A','Word B','Word C'].map(x=>[x,'Noun',small('View')+' '+small('Edit')])),panel('Word details','<div class="word">Selected word</div><p>syllable · syllable</p><p>Definition in Filipino appears here.</p><p>Example sentence appears here.</p>'+btn('Play pronunciation')+'<div class="actions">'+small('Edit')+' '+small(role==='Admin'?'Delete word':'Manage own entry')+'</div>'));}
for(const role of ['Admin','Teacher'])add(role,role==='Admin'?'07-dictionary':'10-dictionary','Dictionary','Look up meanings, listen to pronunciation and maintain word entries.',dictionary(role));
function settings(role){return cols(panel(role+' account',field('Name',role==='Admin'?'Admin name':'Teacher name')+field('Email address',role.toLowerCase()+'@example.com')+(role==='Teacher'?'<div class="actions">'+btn('Save profile',true)+'</div>':'')+'<div class="actions">Appearance &nbsp; '+small('Light')+' '+small('Dark')+'</div>'),panel('Change password',field('Current password')+field('New password')+field('Confirm new password')+'<div class="actions">'+btn(role==='Admin'?'Send approval email':'Change password',true)+'</div>'+(role==='Admin'?'<div class="hint">Approve the password change from your email.</div>':'')));}
add('Admin','08-account-settings','Account settings','Manage appearance and your password.',settings('Admin'));
add('Teacher','01-my-classes','My classes','Create a classroom or open an existing class.',
 cols('<div>'+tools('Search classes...')+table(['Class','Students','Action'],sample.map(x=>['Class '+x,'—',small('Open class')]))+'</div>',panel('Create class',field('Class name')+field('Grade level','Select grade')+field('Section')+field('Description','Optional description')+'<div class="actions">'+btn('Create class',true)+'</div>')));
add('Teacher','02-class-workspace','Class workspace','Class A / Assigned lessons',
 `<div class="actions top">${btn('Students')} ${btn('Class report')} ${btn('Reading review')} ${btn('Class chat')} ${btn('Class options')}</div>`+stats(['Class code: ABC123','Students','Assigned lessons'])+tools('Search assigned lessons...',btn('+ Add lessons',true))+tabs(['All lessons','Open','Closed'])+table(['Lesson','Type','Schedule','Actions'],sample.map(x=>['Lesson '+x,'Assessment','Open date / Due date',small('Edit schedule')+' '+small('Notify')+' '+small('Remove')])));
add('Teacher','03-assign-lessons','Assign lessons','Select lessons and set how students will access them.',
 cols('<div>'+tools('Search lessons...')+tabs(['All levels','Beginner','Intermediate','Advanced'])+table(['Select','Lesson','Difficulty','Action'],sample.map(x=>['□','Lesson '+x,'Beginner',small('Preview')]))+'</div>',panel('Assignment settings',field('Class','Class A')+field('Mode','Assessment / Practice')+field('Opens on','Date and time')+field('Due on','Date and time')+'<div class="actions">'+btn('Add selected lessons',true)+'</div>')));
add('Teacher','04-students-and-requests','Students and class requests','Class A / Manage enrolment and open student progress.',
 tools('Search student name...')+table(['Student','Membership','Actions'],sample.map(x=>['Student '+x,'Enrolled',small('View progress')+' '+small('Reading review')+' '+small('Remove')]))+'<div style="height:26px"></div>'+tabs(['Join requests','Leave requests'])+table(['Student','Request','Actions'],[['Student name','Requested to join Class A',small('Approve')+' '+small('Decline')]]));
const skills=['Lecture','Vocabulary','Word recognition','Pronunciation','Comprehension'];
add('Teacher','05-student-progress','Student progress','Class A / Student name / Learning results',
 stats(['Lesson completion','Current results','Lessons finished'])+table(['Skill','Current result','Assessment'],skills.map(x=>[x,'—','Result or completion status']))+'<div class="note">Teacher notes and lesson breakdown appear below the skill results.</div>',btn('Export report'));
add('Teacher','06-class-report','Class report','Class A / Compare class performance across learning skills.',
 stats(['Overall class score','Students','Lessons finished','Need help'])+table(['Skill','Average','With results','Needs help'],skills.slice(1).map(x=>[x,'—','—','—']))+'<div class="note">Student results, key findings and students needing attention appear below.</div>',btn('Export report'));
add('Teacher','07-reading-queue','Reading review queue','Class A / Choose a student submission to review.',
 tabs(['All students','Pending review','Reviewed'])+tools('Search students...')+table(['Student','Submitted','Review status','Action'],sample.map(x=>['Student '+x,'Date / time','Awaiting review',small('Open readings')])));
add('Teacher','08-reading-assessment','Reading assessment','Class A / Student name / Lesson A',
 cols(panel('Student recording','<div class="word">Page 1</div><p>The reading passage appears here.</p><div class="audio">'+btn('Play')+' <span>00:00 ───────────────── 00:00</span></div><div class="word">Page 2</div><p>The next reading passage appears here.</p><div class="audio">'+btn('Play')+' <span>00:00 ───────────────── 00:00</span></div>'),panel('Grade this lesson',field('Accuracy','Select score (1–4)')+field('Smoothness and pace','Select score (1–4)')+field('Expression and phrasing','Select score (1–4)')+'<div class="actions">'+btn('Save grade',true)+'</div><div class="hint">1 Needs guidance · 2 Developing<br>3 Mostly fluent · 4 Fluent</div>')));
add('Teacher','09-class-messages','Class messages','Read and send messages in your class conversations.',
 `<div class="chatgrid"><section class="panel"><h3>Class conversations</h3>${sample.map(x=>row('Class '+x,'Latest message preview','Open')).join('')}</section><section class="panel chatpanel"><h3>Class A ${small('Chat open')}</h3><div class="bubble"><b>Student name</b><div>Sample class message.</div><small>Time</small></div><div class="bubble own"><b>Teacher</b><div>Sample teacher reply.</div><small>Time</small></div><div class="compose"><div class="input">Type a message...</div>${btn('Send',true)}</div></section></div>`);
add('Teacher','11-account-settings','Account settings','Manage your profile, appearance and password.',settings('Teacher'));
(async()=>{
 const old=await fs.readFile(path.join(__dirname,'output','01-login.html'),'utf8');
 const css=old.match(/<style>([\s\S]*?)<\/style>/)[1]+`.bar{gap:25px}.bar .brand{margin-right:15px}.panel+ .panel{margin-top:0}.panel{margin-top:0}main> .panel{margin-top:26px}.tabs{display:flex;gap:0;border-bottom:1px solid #aaa;margin:0 0 23px}.tabs span{font-size:14px;padding:12px 16px}.tabs .selected{background:#eee;border-bottom:2px solid #444}.actions{display:flex;gap:10px;align-items:center;margin-top:24px}.actions.top{margin:0 0 25px}.formwide{max-width:620px}.formwide label:first-child{margin-top:0}.input{color:#888}.tall{height:95px}.editor{display:grid;grid-template-columns:255px 1fr;gap:30px}.editorstep{font-size:16px;padding:19px 12px;border-bottom:1px solid #ddd}.chosen{background:#eee}.word{font-size:22px;margin:23px 0 12px}.hint{font-size:14px;line-height:1.7;color:#777;margin-top:22px}.audio{display:flex;gap:18px;align-items:center;border:1px solid #ccc;padding:15px;font-size:14px;color:#777}.chatgrid{display:grid;grid-template-columns:340px 1fr;gap:25px}.chatpanel{height:480px;position:relative}.bubble{border:1px solid #bbb;padding:16px;margin:26px 0;width:65%;font-size:15px;line-height:1.8}.bubble small{color:#888}.own{margin-left:auto;background:#f4f4f4}.compose{position:absolute;bottom:22px;left:24px;right:24px;display:flex;gap:12px}.compose .input{flex:1}.panel p{font-size:15px}.row{gap:12px}.outline{white-space:nowrap}.panel label{margin-top:17px}.window{position:relative}main{padding:28px 36px}.heading{margin-bottom:24px}.stats{margin-bottom:24px}.stat{padding:16px 22px}.tabs{margin-bottom:18px}.tabs span{padding:10px 15px}th,td{padding:14px 18px}.actions.top{margin-bottom:20px}`;
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  for(const s of screens){
   const items=s.role==='Admin'?['Overview','Teachers','Students','Classes','Lessons','Dictionary']:['Overview','My classes','Messages','Dictionary'];
   const nav=`<div class="bar"><b class="brand">BaSaya</b>${items.map(x=>`<span>${x}</span>`).join('')}<span class="right">${s.role} | Log out</span></div>`;
   const html=`<!doctype html><html><head><meta charset="UTF-8"><style>${css}</style></head><body><div class="sheet"><div class="caption"><h1>${s.role} / ${s.title}</h1><span>BaSaya · Plain wireframe</span></div><div class="window">${nav}<main><div class="heading"><div><h2>${s.title}</h2><p>${s.description}</p></div>${s.action}</div>${s.body}</main></div><footer><span>Layout concept only · Placeholder content and values</span><span>${s.role} / ${s.title}</span></footer></div></body></html>`;
   const dir=path.join(root,s.role);await fs.mkdir(dir,{recursive:true});
   await fs.writeFile(path.join(dir,s.file+'.html'),html);await page.setContent(html);
   const issues=await page.evaluate(()=>{const w=document.querySelector('.window'),m=document.querySelector('main');return{pageOverflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,contentClipped:m.getBoundingClientRect().bottom>w.getBoundingClientRect().bottom,windowOverflow:w.scrollWidth>w.clientWidth};});
   if(Object.values(issues).some(Boolean))throw Error(s.file+' '+JSON.stringify(issues));
   await page.screenshot({path:path.join(dir,s.file+'.png')});
  }
  await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(screens.map(({role,file,title})=>({role,file:file+'.png',title})),null,2));
  console.log(`Created and checked ${screens.length} PNG mockups (${screens.filter(x=>x.role==='Admin').length} admin, ${screens.filter(x=>x.role==='Teacher').length} teacher).`);
 }finally{await browser.close();}
})();
