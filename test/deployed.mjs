// Opt-in smoke check against a deployment and an operator-supplied public share.
const { DEPLOYED_RELAY_URL: endpoint, DEPLOYED_ALLOWED_ORIGIN: origin, DEPLOYED_SHARE_URL: shareUrl } = process.env;
if (!endpoint || !origin || !shareUrl) {
  throw new Error('Set DEPLOYED_RELAY_URL, DEPLOYED_ALLOWED_ORIGIN, and DEPLOYED_SHARE_URL to run deployed checks.');
}
const headers = { Origin: origin, 'Content-Type': 'application/json' };
const preflight = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' } });
if (preflight.status !== 204 || preflight.headers.get('access-control-allow-origin') !== origin) throw new Error('CORS preflight failed');
const invalid = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ shareUrl: 'https://evil.example/' }) });
if (invalid.status !== 400 || (await invalid.json()).error?.code !== 'policy') throw new Error('Initial URL policy failed');
const result = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ shareUrl }) });
if (!result.ok || !result.headers.get('content-type')?.startsWith('text/html') || !(await result.text()).toLowerCase().includes('<html')) throw new Error(`Expected complete HTML, got HTTP ${result.status}`);
console.log('Deployed CORS, policy, and HTML smoke checks passed.');
