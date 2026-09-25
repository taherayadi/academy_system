import { describe, it, expect } from 'vitest';
import {
  CENTER_TYPES,
  CENTER_TYPE_LABEL,
  CENTER_TYPE_BADGE,
  normalizeCenterType,
  isModuleAllowedForCenterType,
} from './constants';

describe('normalizeCenterType — canonical center types incl. the two new ones', () => {
  it('maps the 4 canonical keys to themselves', () => {
    expect(normalizeCenterType('creche')).toBe('creche');
    expect(normalizeCenterType('jardin')).toBe('jardin');
    expect(normalizeCenterType('garderie')).toBe('garderie');
    expect(normalizeCenterType('formation')).toBe('formation');
  });

  it('is accent-insensitive (« Crèche » → creche)', () => {
    expect(normalizeCenterType('Crèche')).toBe('creche');
    expect(normalizeCenterType('crèche enfants')).toBe('creche');
  });

  it('recognizes DB variants for all four types', () => {
    expect(normalizeCenterType("Jardin d'enfant")).toBe('jardin');
    expect(normalizeCenterType('Garderie de jour')).toBe('garderie');
    expect(normalizeCenterType('Centre de formation')).toBe('formation');
  });

  it('returns "" for unknown, empty and missing values', () => {
    expect(normalizeCenterType('école primaire')).toBe('');
    expect(normalizeCenterType('')).toBe('');
    expect(normalizeCenterType(undefined)).toBe('');
  });
});

describe('CENTER_TYPES — the shared source of truth', () => {
  it('contains exactly the 4 supported types', () => {
    expect(CENTER_TYPES.map(ct => ct.key)).toEqual(['creche', 'jardin', 'garderie', 'formation']);
  });

  it('exposes a label and badge tone for every type', () => {
    for (const ct of CENTER_TYPES) {
      expect(CENTER_TYPE_LABEL[ct.key]).toBeTruthy();
      expect(CENTER_TYPE_BADGE[ct.key]).toBeTruthy();
    }
  });
});

describe('isModuleAllowedForCenterType — the eligibility matrix', () => {
  it('allows base modules for every type (and untyped centers)', () => {
    for (const key of ['scolaire', 'finance', 'studentTimeSheets']) {
      expect(isModuleAllowedForCenterType(key, 'creche')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'jardin')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'garderie')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'formation')).toBe(true);
      expect(isModuleAllowedForCenterType(key, '')).toBe(true);
    }
  });

  it('forbids school-support modules for creche and jardin', () => {
    for (const key of ['etude', 'coursParticuliers', 'revision', 'formations']) {
      expect(isModuleAllowedForCenterType(key, 'creche')).toBe(false);
      expect(isModuleAllowedForCenterType(key, 'jardin')).toBe(false);
      expect(isModuleAllowedForCenterType(key, 'garderie')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'formation')).toBe(true);
    }
  });

  it('allows universal modules for every type', () => {
    for (const key of ['cantine', 'transport', 'events', 'staff', 'activites', 'competences']) {
      expect(isModuleAllowedForCenterType(key, 'creche')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'jardin')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'garderie')).toBe(true);
      expect(isModuleAllowedForCenterType(key, 'formation')).toBe(true);
    }
  });

  it('keeps the removed Library module forbidden everywhere', () => {
    expect(isModuleAllowedForCenterType('bibliotheque', 'garderie')).toBe(false);
    expect(isModuleAllowedForCenterType('bibliotheque', 'formation')).toBe(false);
  });

  it('stays permissive for legacy untyped centers', () => {
    expect(isModuleAllowedForCenterType('etude', '')).toBe(true);
  });
});
