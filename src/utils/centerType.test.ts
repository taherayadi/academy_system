import { describe, it, expect } from 'vitest';
import { CENTER_TYPES, hasSchoolLevel, hasStudyModules } from './centerType';

describe('CENTER_TYPES', () => {
  it('lists the four accepted types in order', () => {
    expect(CENTER_TYPES).toEqual(['jardin', 'creche', 'garderie', 'formation']);
  });
});

describe('hasSchoolLevel', () => {
  it('is true for school-bearing types', () => {
    expect(hasSchoolLevel('garderie')).toBe(true);
    expect(hasSchoolLevel('formation')).toBe(true);
  });

  it('is false for early-childhood types', () => {
    expect(hasSchoolLevel('creche')).toBe(false);
    expect(hasSchoolLevel('jardin')).toBe(false);
  });

  it('defaults to true (legacy visibility) for unknown/empty values', () => {
    expect(hasSchoolLevel(undefined)).toBe(true);
    expect(hasSchoolLevel(null)).toBe(true);
    expect(hasSchoolLevel('')).toBe(true);
    expect(hasSchoolLevel('unknown-legacy-type')).toBe(true);
  });
});

describe('hasStudyModules', () => {
  it('is true for school-bearing types', () => {
    expect(hasStudyModules('garderie')).toBe(true);
    expect(hasStudyModules('formation')).toBe(true);
  });

  it('is false for early-childhood types', () => {
    expect(hasStudyModules('creche')).toBe(false);
    expect(hasStudyModules('jardin')).toBe(false);
  });

  it('defaults to true (legacy visibility) for unknown/empty values', () => {
    expect(hasStudyModules(undefined)).toBe(true);
    expect(hasStudyModules(null)).toBe(true);
    expect(hasStudyModules('')).toBe(true);
    expect(hasStudyModules('invented-value')).toBe(true);
  });
});
