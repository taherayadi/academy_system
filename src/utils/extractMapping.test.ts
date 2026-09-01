import { describe, expect, it } from 'vitest';
import { digitsOnlyPhone, normalizeExtractedGrade, parseExtractedDate } from './extractMapping';

describe('parseExtractedDate', () => {
  it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
    expect(parseExtractedDate('14/03/2010')).toBe('2010-03-14');
  });

  it('passes through ISO dates', () => {
    expect(parseExtractedDate('2010-03-14')).toBe('2010-03-14');
  });

  it('returns empty for blank input', () => {
    expect(parseExtractedDate('')).toBe('');
  });
});

describe('normalizeExtractedGrade', () => {
  it('maps Lycée 1ère to form value', () => {
    expect(normalizeExtractedGrade('Lycée 1ère')).toBe('Lycée 1ère Année');
  });

  it('keeps exact form values', () => {
    expect(normalizeExtractedGrade('Collège 8ème Année')).toBe('Collège 8ème Année');
  });

  it('maps Collège 3ème to 9ème Année', () => {
    expect(normalizeExtractedGrade('Collège 3ème')).toBe('Collège 9ème Année');
  });
});

describe('digitsOnlyPhone', () => {
  it('strips spaces from fixed phone', () => {
    expect(digitsOnlyPhone('44 911 119')).toBe('44911119');
  });
});
