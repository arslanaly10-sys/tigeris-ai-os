/**
 * Local evidence storage (D-57): files are written once under UPLOAD_DIR, outside the web root, named by their
 * SHA-256 and grouped by institution. The database keeps the metadata and provenance; the file is never executed
 * or served back as-is by the API.
 */
import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { config } from '../config';

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function storeUpload(institutionId: string, bytes: Buffer, kind: string) {
  const digest = sha256(bytes);
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
