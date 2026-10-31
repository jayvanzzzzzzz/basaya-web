const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = 'C:/Projects/BaSaya';
const preview = path.resolve(__dirname, '../.android-download-design');
const file = 'app/src/main/java/ph/basaya/app/data/audio/LectureAudioStore.kt';
const original = fs.readFileSync(path.join(root, file), 'utf8');
const text = original.replace(/\r\n/g, '\n');
const before = '        } finally {\n            cancellationWatcher.cancel()';
if (!text.includes(before)) throw new Error('Missing cancellation cleanup');
const result = text.replace(before, `        } catch (failure: Exception) {
            // Socket closure is expected on cancellation, not a download failure.
            currentCoroutineContext().ensureActive()
            throw failure
        } finally {
            cancellationWatcher.cancel()`);
fs.writeFileSync(path.join(preview, file), result);
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
fs.writeFileSync(path.join(preview, 'manifest.json'), JSON.stringify([{ file, originalHash: sha(original), resultHash: sha(result) }], null, 2));
console.log('Prepared cancellation error normalization.');
