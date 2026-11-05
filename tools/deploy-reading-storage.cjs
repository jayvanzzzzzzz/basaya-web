// Provision the service-to-service secret through stdin. Never write or print it.
const { randomBytes } = require('crypto');
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const secret = randomBytes(32).toString('hex');
function run(args, cwd, input) {
  const result = spawnSync('npx.cmd', args, { cwd, input, encoding: 'utf8', shell: true, windowsHide: true, timeout: 240000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) {
    const detail = (result.stdout || '') + (result.stderr || '');
    throw new Error(detail.replaceAll(secret, '[REDACTED]') || result.error?.message || 'Deployment failed.');
  }
  return (result.stdout || '') + (result.stderr || '');
}
run(['--yes', 'wrangler', 'deploy'], path.join(root, 'cloudflare/readings'));
console.log('Private recording Worker deployed.');
run(['--yes', 'wrangler', 'secret', 'put', 'READINGS_STORAGE_SECRET'], path.join(root, 'cloudflare/readings'), secret + '\n');
console.log('Worker upload credential configured.');
run(['--yes', 'vercel@65.9.0', 'env', 'add', 'READINGS_STORAGE_SECRET', 'production', '--force'], path.join(root, 'notify-api'), secret);
run(['--yes', 'vercel@65.9.0', 'env', 'add', 'READINGS_WORKER_URL', 'production', '--force'], path.join(root, 'notify-api'), 'https://basaya-readings.jayvanzsingca5.workers.dev');
console.log('API private storage connection configured.');
run(['--yes', 'vercel@65.9.0', 'deploy', '--prod', '--yes'], path.join(root, 'notify-api'));
console.log('Reading API deployed to production.');
