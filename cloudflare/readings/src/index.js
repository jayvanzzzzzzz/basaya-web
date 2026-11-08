const encoder = new TextEncoder();
const key = secret => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const objectKey = url.pathname.slice(1);
    if (!/^student-readings\/[A-Za-z0-9_-]{1,128}\/[a-f0-9]{64}\/[0-7]\/[a-f0-9-]{36}\.wav$/.test(objectKey)) return new Response('Not found', { status: 404 });
    if (!env.READINGS_STORAGE_SECRET) return new Response('Unavailable', { status: 503 });
    if (request.method === 'PUT') {
      // Constant-time verification of the API-only upload credential.
      const supplied = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
      const hashes = await Promise.all([supplied, env.READINGS_STORAGE_SECRET].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
      const a = new Uint8Array(hashes[0]), b = new Uint8Array(hashes[1]);
      let different = 0; for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
      if (different) return new Response('Forbidden', { status: 403 });
      const audio = await request.arrayBuffer();
      if (audio.byteLength < 3244 || audio.byteLength > 1440044) return new Response('Invalid audio', { status: 400 });
      await env.RECORDINGS.put(objectKey, audio, { httpMetadata: { contentType: 'audio/wav', cacheControl: 'private, no-store' } });
      return new Response(null, { status: 204 });
    }
    if (request.method !== 'GET') return new Response('Not allowed', { status: 405 });
    const expiry = Number(url.searchParams.get('expires'));
    const signature = url.searchParams.get('signature') || '';
    if (!Number.isInteger(expiry) || expiry < Date.now() / 1000 || expiry > Date.now() / 1000 + 610 || !/^[a-f0-9]{64}$/.test(signature)) return new Response('Expired', { status: 403 });
    const valid = await crypto.subtle.verify('HMAC', await key(env.READINGS_STORAGE_SECRET), Uint8Array.from(signature.match(/../g), hex => parseInt(hex, 16)), encoder.encode(`GET|${objectKey}|${expiry}`));
    if (!valid) return new Response('Forbidden', { status: 403 });
    const object = await env.RECORDINGS.get(objectKey, { range: request.headers });
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers({ 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    let status = 200;
    if (object.range?.length != null) {
      const start = object.range.offset || 0;
      headers.set('Content-Range', `bytes ${start}-${start + object.range.length - 1}/${object.size}`);
      headers.set('Content-Length', String(object.range.length)); status = 206;
    } else headers.set('Content-Length', String(object.size));
    return new Response(object.body, { headers, status });
  },
};
