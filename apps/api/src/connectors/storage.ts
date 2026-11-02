/**
 * Evidence storage (D-57, D-122): files are written once, named by their SHA-256 and grouped by institution, either
 * under UPLOAD_DIR (outside the web root) or, when EVIDENCE_S3_ENDPOINT is set, in an S3-compatible bucket. The database keeps the metadata and provenance; the file is never executed
 * or served back as-is by the API.
 */
import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from '../config';
import { putObject } from './s3';

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function storeUpload(institutionId: string, bytes: Buffer, kind: string) {
  const digest = sha256(bytes);
  if (config.EVIDENCE_S3_ENDPOINT) {
    const key = `${institutionId}/${digest}.${kind}`;
    await putObject(config.EVIDENCE_S3_ENDPOINT, config.EVIDENCE_S3_BUCKET, key, bytes, {
      accessKeyId: config.EVIDENCE_S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: config.EVIDENCE_S3_SECRET_ACCESS_KEY ?? '',
      region: config.EVIDENCE_S3_REGION,
    });
    return { sha256: digest, path: `s3://${config.EVIDENCE_S3_BUCKET}/${key}` };
  }
  const dir = resolve(config.UPLOAD_DIR, institutionId);
  await mkdir(dir, { recursive: true, mode: 0o750 });
  const path = join(dir, `${digest}.${kind}`);
  const exists = await stat(path).then(
    () => true,
    () => false,
  );
  if (!exists) await writeFile(path, bytes, { mode: 0o640 });
  return { sha256: digest, path };
}
