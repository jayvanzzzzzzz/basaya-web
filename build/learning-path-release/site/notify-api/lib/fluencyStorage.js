import { createHash, createHmac } from 'node:crypto';

const digest = data => createHash('sha256').update(data).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

// Private R2 S3 API. Keys and credentials never leave the API; playback links expire.
function sign(method, key, { body, expires } = {}) {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: access, R2_SECRET_ACCESS_KEY: secret, R2_FLUENCY_BUCKET: bucket } = process.env;
  if (!account || !access || !secret || !bucket) throw Object.assign(new Error('Hindi pa handa ang pag-save ng recording. Naka-save pa rin ang draft sa device.'), { status: 503 });
  const url = new URL(`https://${account}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`);
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = stamp.slice(0, 8), scope = `${date}/auto/s3/aws4_request`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, date), 'auto'), 's3'), 'aws4_request');
  let headers, canonicalHeaders, signedHeaders, payload;
  if (expires) {
    const params = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${access}/${scope}`, 'X-Amz-Date': stamp, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host' };
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    canonicalHeaders = `host:${url.host}\n`; signedHeaders = 'host'; payload = 'UNSIGNED-PAYLOAD'; headers = {};
  } else {
    payload = digest(body || ''); signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    headers = { 'x-amz-content-sha256': payload, 'x-amz-date': stamp };
    canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payload}\nx-amz-date:${stamp}\n`;
  }
  const query = [...url.searchParams].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canonical = [method, url.pathname, query, canonicalHeaders, signedHeaders, payload].join('\n');
  const signature = createHmac('sha256', signingKey).update(`AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${digest(canonical)}`).digest('hex');
  if (expires) url.searchParams.set('X-Amz-Signature', signature);
  else headers.Authorization = `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: url.href, headers };
}

export async function putFluencyAudio(key, bytes) {
  if (process.env.READINGS_WORKER_URL && process.env.READINGS_STORAGE_SECRET) {
    const response = await fetch(`${process.env.READINGS_WORKER_URL.replace(/\/$/, '')}/${key}`, { method: 'PUT', headers: { Authorization: `Bearer ${process.env.READINGS_STORAGE_SECRET}`, 'Content-Type': 'audio/wav' }, body: bytes, signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw Object.assign(new Error('Hindi na-upload ang recording. Subukan muli.'), { status: 503 });
    return;
  }
  const { url, headers } = sign('PUT', key, { body: bytes });
  const response = await fetch(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'audio/wav' }, body: bytes, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw Object.assign(new Error('Hindi na-upload ang recording. Subukan muli.'), { status: 503 });
}
export const fluencyPlaybackUrl = key => {
  if (!process.env.READINGS_WORKER_URL || !process.env.READINGS_STORAGE_SECRET) return sign('GET', key, { expires: 600 }).url;
  const expires = Math.floor(Date.now() / 1000) + 600;
  const signature = createHmac('sha256', process.env.READINGS_STORAGE_SECRET).update(`GET|${key}|${expires}`).digest('hex');
  return `${process.env.READINGS_WORKER_URL.replace(/\/$/, '')}/${key}?expires=${expires}&signature=${signature}`;
};

export function validateFluencyAudio(base64) {
  if (typeof base64 !== 'string' || base64.length > 1_930_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw Object.assign(new Error('Invalid recording.'), { status: 400 });
  const wav = Buffer.from(base64, 'base64');
  if (wav.length < 3244 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE' || wav.toString('ascii', 12, 16) !== 'fmt ' || wav.readUInt32LE(16) !== 16 || wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== 16000 || wav.readUInt16LE(34) !== 16 || wav.toString('ascii', 36, 40) !== 'data' || wav.readUInt32LE(40) !== wav.length - 44 || wav.length > 1_440_044) throw Object.assign(new Error('Use a mono WAV recording up to 45 seconds.'), { status: 400 });
  let loud = 0;
  for (let i = 44; i + 1 < wav.length; i += 2) if (Math.abs(wav.readInt16LE(i)) > 300) loud++;
  if (loud < 160) throw Object.assign(new Error('Wala akong narinig. Hawakan muli ang mikropono habang bumabasa.'), { status: 400 });
  return wav;
}
