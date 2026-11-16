const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
(async () => {
  const {assistantHelp} = await import(pathToFileURL(path.resolve(__dirname, '../../js/assistantHelp.js')).href);
  const articles = assistantHelp.map(({id,title,question,text,route,link}) => ({id,title,question,route,link,
    text: text.replace('Payagan ang microphone sa browser', 'Payagan ang microphone sa app')
      .replace('sa login page', 'sa login screen')}));
  const dir = path.join(__dirname, 'staged/app/src/main/assets');
  fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(path.join(dir, 'assistant-help.json'), JSON.stringify(articles, null, 2) + '\n');
  console.log(`Prepared ${articles.length} offline guides from the existing web help reference.`);
})();
