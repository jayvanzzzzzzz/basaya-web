const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const adb = 'C:/Users/Scean Andrei/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const run = (...args) => execFileSync(adb, args, {timeout:120000, maxBuffer:20*1024*1024, windowsHide:true});
const dir = path.join(__dirname, 'qa');
fs.mkdirSync(dir, {recursive:true});
function snapshot(name) {
  run('shell', 'uiautomator', 'dump', '/sdcard/basaya-assistant-qa.xml');
  const xml = run('shell','cat','/sdcard/basaya-assistant-qa.xml').toString();
  if (name) {
    fs.writeFileSync(path.join(dir, name + '.xml'), xml);
    fs.writeFileSync(path.join(dir, name + '.png'), run('exec-out','screencap','-p'));
  }
  return xml;
}
function tap(attr, value) {
  const xml = snapshot();
  const node = [...xml.matchAll(/<node\b[^>]*>/g)].map(m=>m[0]).find(n=>n.includes(`${attr}="${value}"`));
  if (!node) throw Error('Visible control missing: ' + value);
  const [,left,top,right,bottom] = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  run('shell','input','tap',String(Math.round((+left + +right)/2)),String(Math.round((+top + +bottom)/2)));
}
const [action, arg] = process.argv.slice(2);
if (action === 'begin') {
  const prefs = path.join(dir,'power-original.json');
  if (!fs.existsSync(prefs)) fs.writeFileSync(prefs,JSON.stringify({stayOn:run('shell','settings','get','global','stay_on_while_plugged_in').toString().trim()}));
  run('shell','svc','power','stayon','usb');
  run('shell','input','keyevent','224');
  run('shell','wm','dismiss-keyguard');
  run('shell','am','force-stop','com.example.basaya');
  console.log('Test phone awake; original power setting saved.');
} else if (action === 'end') {
  const prefs = path.join(dir,'power-original.json');
  const {stayOn} = JSON.parse(fs.readFileSync(prefs));
  if (!/^\d+$/.test(stayOn)) throw Error('Unexpected original power setting');
  run('shell','settings','put','global','stay_on_while_plugged_in',stayOn);
  fs.unlinkSync(prefs);
  console.log('Original phone power setting restored.');
} else if (action === 'install') {
  console.log(run('install','-r','C:/Projects/BaSaya/app/build/outputs/apk/debug/app-debug.apk').toString());
} else if (action === 'launch') {
  console.log(run('shell','am','start','-n','com.example.basaya/ph.basaya.app.ui.SplashActivity').toString());
} else if (action === 'wake') {
  run('shell','input','keyevent','224');
  run('shell','wm','dismiss-keyguard');
} else if (action === 'screen') {
  fs.writeFileSync(path.join(dir, arg + '.png'), run('exec-out','screencap','-p'));
  console.log(path.join(dir, arg + '.png'));
} else if (action === 'diagnose') {
  const output = run('logcat','-d','-t','2000','-s','TestRunner','AndroidRuntime','ActivityTaskManager').toString();
  fs.writeFileSync(path.join(dir,'device-log.txt'),output);
  console.log(output.split('\n').filter(line=>/Assistant|TestRunner|FATAL|Exception|Error|Caused by|failed/.test(line)).slice(-65).join('\n'));
} else if (action === 'tests') {
  console.log(run('install','-r','-t','C:/Projects/BaSaya/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk').toString());
  const selected = 'ph.basaya.app.ui.assistant.AssistantScreenTest' + (arg ? '#' + arg : '');
  const extra = arg === 'sendsOneAuthenticatedAppHelpQuestion' ? ['-e','assistantLive','true'] : [];
  const output = run('shell','am','instrument','-w',...extra,'-e','class',selected,
    'com.example.basaya.test/androidx.test.runner.AndroidJUnitRunner').toString();
  fs.writeFileSync(path.join(dir, arg ? arg + '.txt' : 'ui-tests.txt'), output);
  console.log(output);
} else if (action === 'layouts') {
  console.log(run('install','-r','-t','C:/Projects/BaSaya/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk').toString());
  const output = run('shell','am','instrument','-w','-e','class','ph.basaya.app.ui.assistant.AssistantLayoutTest',
    'com.example.basaya.test/androidx.test.runner.AndroidJUnitRunner').toString();
  fs.writeFileSync(path.join(dir,'layout-tests.txt'),output);
  console.log(output);
  if (!output.includes('OK (1 test)')) process.exit(1);
  for (const mode of ['light','dark']) for (const width of [320,411]) {
    const name = `${mode}-${width}.png`;
    fs.writeFileSync(path.join(dir,name),run('exec-out','run-as','com.example.basaya','cat','cache/assistant-layout/'+name));
  }
} else if (action === 'tap') tap('resource-id', 'com.example.basaya:id/' + arg);
else if (action === 'point') {
  const coords = process.argv.slice(3);
  if (coords.length !== 2 || coords.some(value=>!/^\d+$/.test(value))) throw Error('Expected two pixel coordinates');
  run('shell','input','tap',...coords);
}
else if (action === 'text') tap('text', arg);
else if (action === 'back') run('shell','input','keyevent','4');
else if (action === 'capture') {
  const xml = snapshot(arg);
  const ids = [...xml.matchAll(/resource-id="com.example.basaya:id\/([^"]+)"/g)].map(m=>m[1]);
  const states = [...xml.matchAll(/<node\b[^>]*>/g)].map(m=>m[0]).filter(n=>/id\/assistant(Status|Quota|Send|Input)/.test(n))
    .map(n=>({id:n.match(/resource-id="([^"]*)"/)?.[1],text:n.match(/text="([^"]*)"/)?.[1],enabled:n.match(/enabled="([^"]*)"/)?.[1],bounds:n.match(/bounds="([^"]*)"/)?.[1]}));
  console.log(JSON.stringify({screenshot:path.join(dir,arg+'.png'),ids,states},null,2));
} else if (action === 'crashes') {
  const log = run('logcat','-d','-b','crash','-t','100').toString();
  fs.writeFileSync(path.join(dir,'crashes.txt'), log);
  console.log(log.includes('ph.basaya.app.ui.assistant') ? log : 'No Assistant crash in the crash buffer.');
} else throw Error('Unknown action');
