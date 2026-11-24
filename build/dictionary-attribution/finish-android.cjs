const fs = require('node:fs');
const base = 'C:/Projects/BaSaya/app/src/main/java/ph/basaya/app/';
const file = base + 'data/dictionary/Dictionary.kt';
const source = fs.readFileSync(file, 'utf8');
if (!source.includes('fromTeacher = true,')) throw new Error('Expected entity mapping missing');
fs.writeFileSync(file, source.replace('fromTeacher = true,', 'fromTeacher = DictionaryWords.normalize(entity.key) !in seedByKey,'));
console.log('Imported words, including legacy corrections, have no staff label in Android.');
