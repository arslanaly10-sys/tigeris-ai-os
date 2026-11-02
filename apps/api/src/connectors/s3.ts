/**
 * Minimal S3-compatible client (MinIO, AWS S3) for the evidence store (Phase 5H, D-114): one signed PUT, AWS
 * Signature Version 4 with node:crypto. Path-style addressing so MinIO works without DNS buckets.
 */
import { createHash, createHmac } from 'node:crypto';

const hex = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/** Signs a request (SigV4, header auth). Returns the headers to send, including Authorization. */
export function signV4(
  req: { method: string; url: URL; headers: Record<string, string>; body: Buffer | string; service?: string },
  creds: S3Credentials,
  now = new Date(),
): Record<string, string> {
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const service = req.service ?? 's3';
  const headers: Record<string, string> = { ...req.headers, host: req.url.host, 'x-amz-date': amzDate };
  const names = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]));
  const query = [...req.url.searchParams.entries()]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join('&');
  const canonical = [
    req.method,
    req.url.pathname,
    query,
    names.map((n) => `${n}:${lower[n]}\n`).join(''),
    names.join(';'),
    lower['x-amz-content-sha256'] ?? hex(req.body),
  ].join('\n');
  const scope = `${day}/${creds.region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(canonical)].join('\n');
  const key = hmac(
    hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, day), creds.region), service),
    'aws4_request',
  );
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
  };
}

/** PUT an object (path-style). Throws with the HTTP status when the store refuses it. */
export async function putObject(
  endpoint: string,
  bucket: string,
  key: string,
  body: Buffer,
  creds: S3Credentials,
) {
  const url = new URL(
    `${endpoint.replace(/\/$/, '')}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`,
  );
  const headers = signV4(
    {
      method: 'PUT',
      url,
      headers: { 'x-amz-content-sha256': hex(body), 'content-type': 'application/octet-stream' },
      body,
    },
    creds,
  );
  const res = await fetch(url, { method: 'PUT', headers, body, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Evidence store refused the upload: HTTP ${res.status}`);
}
