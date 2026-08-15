import { describe, it, expect } from 'vitest';
import {
  PAYLOAD_TEMPLATES,
  ACTION_TARGETS,
  WRAPPER_PHRASES,
  EVASION_MODIFIERS,
} from '../data/payload-templates';

describe('Payload Templates', () => {
  it('should have templates defined', () => {
    expect(PAYLOAD_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('should have unique IDs', () => {
    const ids = PAYLOAD_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('templates should have valid severity levels', () => {
    const valid = ['low', 'medium', 'high', 'critical'];
    for (const t of PAYLOAD_TEMPLATES) {
      expect(valid).toContain(t.severity);
    }
  });

  it('templates should declare variables used in template string', () => {
    for (const t of PAYLOAD_TEMPLATES) {
      const matches = t.template.match(/\{\{(\w+)\}\}/g) || [];
      const usedVars = [...new Set(matches.map((m) => m.slice(2, -2)))];
      for (const v of usedVars) {
        expect(t.variables, `Template ${t.id} uses {{${v}}} but doesn't declare it`).toContain(v);
      }
    }
  });

  it('has action targets', () => {
    expect(ACTION_TARGETS.length).toBeGreaterThan(0);
  });

  it('has wrapper phrases', () => {
    expect(WRAPPER_PHRASES.length).toBeGreaterThan(0);
  });
});

describe('Evasion Modifiers', () => {
  it('should have modifiers defined', () => {
    expect(EVASION_MODIFIERS.length).toBeGreaterThan(0);
  });

  it('should have a "none" modifier', () => {
    const none = EVASION_MODIFIERS.find((m) => m.id === 'none');
    expect(none).toBeDefined();
    expect(none!.apply('test')).toBe('test');
  });

  it('base64 modifier encodes correctly', () => {
    const b64 = EVASION_MODIFIERS.find((m) => m.id === 'base64');
    expect(b64).toBeDefined();
    expect(b64!.apply('hello')).toBe(Buffer.from('hello').toString('base64'));
  });

  it('rot13 modifier encodes correctly', () => {
    const rot13 = EVASION_MODIFIERS.find((m) => m.id === 'rot13');
    expect(rot13).toBeDefined();
    expect(rot13!.apply('hello')).toBe('uryyb');
    // Double ROT13 should return original
    expect(rot13!.apply(rot13!.apply('hello'))).toBe('hello');
  });

  it('reverse modifier works', () => {
    const rev = EVASION_MODIFIERS.find((m) => m.id === 'reverse');
    expect(rev).toBeDefined();
    expect(rev!.apply('hello')).toBe('olleh');
  });

  it('leetspeak modifier substitutes characters', () => {
    const leet = EVASION_MODIFIERS.find((m) => m.id === 'leetspeak');
    expect(leet).toBeDefined();
    const result = leet!.apply('test');
    expect(result).not.toBe('test');
    expect(result).toContain('7');
  });

  it('zero-width space modifier inserts characters', () => {
    const zwsp = EVASION_MODIFIERS.find((m) => m.id === 'zwsp');
    expect(zwsp).toBeDefined();
    const result = zwsp!.apply('ab');
    expect(result.length).toBeGreaterThan(2);
  });

  it('all modifiers produce string output', () => {
    for (const mod of EVASION_MODIFIERS) {
      const result = mod.apply('test input string');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

describe('XPIA-free output guard', () => {
  const BANNED = /xpia/i;

  it('no payload template contains "XPIA"', () => {
    for (const t of PAYLOAD_TEMPLATES) {
      expect(
        BANNED.test(t.template),
        `Payload template ${t.id} contains "XPIA"`,
      ).toBe(false);
    }
  });

  it('no action target contains "XPIA"', () => {
    for (const action of ACTION_TARGETS) {
      expect(BANNED.test(action), `Action target "${action}" contains "XPIA"`).toBe(false);
    }
  });

  it('no wrapper phrase contains "XPIA"', () => {
    for (const w of WRAPPER_PHRASES) {
      expect(BANNED.test(w), `Wrapper phrase "${w}" contains "XPIA"`).toBe(false);
    }
  });

  it('no evasion modifier name contains "XPIA"', () => {
    for (const mod of EVASION_MODIFIERS) {
      expect(BANNED.test(mod.id), `Evasion modifier ${mod.id} contains "XPIA"`).toBe(false);
      expect(BANNED.test(mod.name), `Evasion modifier name "${mod.name}" contains "XPIA"`).toBe(false);
    }
  });
});
