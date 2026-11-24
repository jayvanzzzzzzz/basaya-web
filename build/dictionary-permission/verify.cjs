const fs = require('node:fs');
const auth = require('C:/Users/Scean Andrei/AppData/Local/npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools/lib/auth.js');
(async () => {
  const account = auth.getGlobalDefaultAccount();
  const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
  const read = async url => {
    const response = await fetch(url, {headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error('Rules API HTTP '+response.status);
    return response.json();
  };
  const release = await read('https://firebaserules.googleapis.com/v1/projects/basaya/releases/cloud.firestore');
  const ruleset = await read('https://firebaserules.googleapis.com/v1/'+release.rulesetName);
  const content = ruleset.source.files.find(file => file.name.endsWith('.rules')).content;
  const normalize = value => value.replaceAll('\r\n','\n').trim();
  if (normalize(content) !== normalize(fs.readFileSync('build/dictionary-permission/firestore.rules','utf8'))) throw Error('Live rules do not match the tested dictionary fix.');
  console.log('Verified: active Firebase rules exactly match the tested dictionary permission fix.');
})().catch(error => {console.error(error.message);process.exitCode=1;});
