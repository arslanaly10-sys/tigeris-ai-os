/**
 * Upload parsing (TR-061). A file is accepted only when its extension and its bytes agree and it is within the size
 * limit. Tabular files become header + string rows for the dataset mapping; documents become extracted text.
 * Nothing in an uploaded file is ever executed: spreadsheets are read as values, documents as text.
 */
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 5000;

export type UploadKind = 'csv' | 'xlsx' | 'json' | 'pdf' | 'docx' | 'txt';

export const MEDIA_TYPES: Record<UploadKind, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  json: 'application/json',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

export const TABULAR_KINDS: readonly UploadKind[] = ['csv', 'xlsx', 'json'];
export const DOCUMENT_KINDS: readonly UploadKind[] = ['pdf', 'docx', 'txt'];

export class UploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const isZip = (b: Buffer) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const looksLikeText = (b: Buffer) => !b.subarray(0, Math.min(b.length, 8192)).includes(0);

/** Determines the upload kind from the file name and confirms it against the content. */
export function sniff(fileName: string, bytes: Buffer): UploadKind {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (!(ext in MEDIA_TYPES))
    throw new UploadError('unsupported_type', `Files of type .${ext} are not accepted.`);
  const kind = ext as UploadKind;
  if (bytes.length === 0) throw new UploadError('empty_file', 'The file is empty.');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadError('too_large', 'The file is larger than 10 MB.');
  const head = bytes.subarray(0, 64 * 1024).toString('latin1');
  const ok =
    kind === 'pdf'
      ? bytes.subarray(0, 5).toString('latin1') === '%PDF-'
      : kind === 'xlsx'
        ? isZip(bytes) && head.includes('xl/')
        : kind === 'docx'
          ? isZip(bytes) && head.includes('word/')
          : looksLikeText(bytes);
  if (!ok)
    throw new UploadError('content_mismatch', `The file's content does not match its .${ext} extension.`);
  return kind;
}

export interface Tabular {
  headers: string[];
  rows: Record<string, string>[];
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    return '';
  }
  return String(v);
}

export async function parseTabular(kind: UploadKind, bytes: Buffer): Promise<Tabular> {
  let headers: string[] = [];
  let rows: Record<string, string>[] = [];
  if (kind === 'csv') {
    const raw = bytes.toString('utf8');
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const records = parseCsv(text, { relax_column_count: true, skip_empty_lines: true }) as string[][];
    headers = (records[0] ?? []).map((h) => h.trim());
    rows = records.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  } else if (kind === 'json') {
    let data: unknown;
    try {
      data = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new UploadError('invalid_json', 'The file is not valid JSON.');
    }
    const list = Array.isArray(data) ? data : (data as { records?: unknown }).records;
    if (!Array.isArray(list) || !list.every((x) => x && typeof x === 'object' && !Array.isArray(x)))
      throw new UploadError('invalid_json', 'JSON must be an array of objects, or { "records": [ … ] }.');
    headers = [...new Set(list.flatMap((o) => Object.keys(o as object)))];
    rows = list.map((o) =>
      Object.fromEntries(
        headers.map((h) => {
          const v = (o as Record<string, unknown>)[h];
          return [h, v === null || v === undefined ? '' : String(v)];
        }),
      ),
    );
  } else if (kind === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    } catch {
      throw new UploadError('invalid_xlsx', 'The workbook could not be read.');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new UploadError('invalid_xlsx', 'The workbook has no sheets.');
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellText(cell.value).trim();
      });
      grid.push(Array.from(cells, (c) => c ?? ''));
    });
    headers = grid[0] ?? [];
    rows = grid.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  } else {
    throw new UploadError('unsupported_type', 'Not a tabular file.');
  }
  if (!headers.length) throw new UploadError('no_header', 'The file has no header row.');
  if (rows.length > MAX_ROWS)
    throw new UploadError('too_many_rows', `The file has more than ${MAX_ROWS} rows.`);
  return { headers, rows };
}

export interface ExtractedDocument {
  text: string;
  pages: number | null;
}

export async function extractDocument(kind: UploadKind, bytes: Buffer): Promise<ExtractedDocument> {
  try {
    if (kind === 'pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      return { text: String(text).trim(), pages: totalPages };
    }
    if (kind === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer: bytes });
      return { text: value.trim(), pages: null };
    }
    if (kind === 'txt') return { text: bytes.toString('utf8').trim(), pages: null };
  } catch {
    throw new UploadError('unreadable_document', 'Text could not be extracted from the document.');
  }
  throw new UploadError('unsupported_type', 'Not a document file.');
}
