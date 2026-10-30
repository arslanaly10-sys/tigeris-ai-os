import { describe, expect, it } from 'vitest';
import { canRead, readScope } from './access';

describe('read scope', () => {
  it('derives clearance from the strongest role', () => {
    expect(readScope(['operations_owner'], []).sensitivities).toEqual(['internal', 'restricted']);
    expect(readScope(['administrator', 'auditor'], []).sensitivities).toEqual([
      'internal',
      'restricted',
      'confidential',
    ]);
    expect(readScope([], []).sensitivities).toEqual([]);
  });

  it('limits to assigned workspaces, keeping institution-wide records visible', () => {
    const s = readScope(['analyst'], ['utilities']);
    expect(canRead(s, { sensitivity: 'restricted', sectorKey: 'utilities' })).toBe(true);
    expect(canRead(s, { sensitivity: 'restricted', sectorKey: 'capital' })).toBe(false);
    expect(canRead(s, { sensitivity: 'internal', sectorKey: null })).toBe(true);
  });

  it('never shows a confidential record above clearance, whatever the workspace', () => {
    const s = readScope(['operations_owner'], []);
    expect(canRead(s, { sensitivity: 'confidential', sectorKey: null })).toBe(false);
  });
});
