const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = 'C:/Projects/BaSaya';
const changes = [
  ['app/src/main/java/ph/basaya/app/ui/activity/PracticeActivity.kt',
    'if (hasChecked || submitting) return@setOnClickListener',
    'if (hasChecked || saveRejected || finishQueued || !preparedState.isCurrent()) return@setOnClickListener'],
  ['app/src/main/java/ph/basaya/app/ui/game/GameWordSaves.kt',
    'val result = assessment?.request(command.text("operation"), "game", command)',
    'val payload = command.deepCopy().apply { if (!completed) remove("words") }\n        val result = assessment?.request(command.text("operation"), "game", payload)']
];
const manifest = changes.map(([relative,before,after]) => {
  const original = fs.readFileSync(path.join(root,relative));
  const source = original.toString('utf8').replace(/\r\n/g,'\n');
  if (!source.includes(before)) throw Error('Expected source changed: '+relative);
  const file = path.join(__dirname,'files',relative);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,source.replace(before,after));
  return {relative,hash:crypto.createHash('sha256').update(original).digest('hex')};
});
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(manifest,null,2));
console.log('Prepared Activity guard and game save payload corrections.');
