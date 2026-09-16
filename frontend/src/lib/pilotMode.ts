export function pilotEnabled() {
  return process.env.PILOT_MODE === 'true' || process.env.NODE_ENV === 'production';
}
export async function trustedPilotProxy(headers: Headers): Promise<boolean> {
  const expected = process.env.PILOT_PROXY_TOKEN;
  const supplied = headers.get('x-pilot-proxy-token');
  if (!expected || expected.length < 32 || !supplied || supplied.length > 512) return false;
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([expected, supplied].map(value => crypto.subtle.digest('SHA-256', encode.encode(value))));
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let different = 0;
  for (let i = 0; i < left.length; i++) different |= left[i] ^ right[i];
  return different === 0;
}
