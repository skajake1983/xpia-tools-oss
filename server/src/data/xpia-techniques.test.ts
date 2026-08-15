import { describe, it, expect } from 'vitest';
import {
  TECHNIQUES,
  XPIA_CATEGORIES,
  XPIA_FRAMEWORKS,
  FRAMEWORK_CATEGORIES,
  getTechniqueById,
  getTechniquesByCategory,
  getTechniqueBySeverity,
  getCategoriesForFramework,
  getFrameworkRef,
} from '../data/xpia-techniques';
import type { XPIAFramework, XPIACategory } from '../data/xpia-techniques';

describe('XPIA Techniques', () => {
  it('should have techniques defined', () => {
    expect(TECHNIQUES.length).toBeGreaterThan(0);
  });

  it('should have unique IDs', () => {
    const ids = TECHNIQUES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should reference valid categories', () => {
    const validCategories = Object.keys(XPIA_CATEGORIES);
    for (const technique of TECHNIQUES) {
      expect(validCategories).toContain(technique.category);
    }
  });

  it('should have valid severity levels', () => {
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    for (const technique of TECHNIQUES) {
      expect(validSeverities).toContain(technique.severity);
    }
  });

  it('should have templates with {{ACTION}} or variant placeholder', () => {
    const actionPattern = /\{\{(?:\w*ACTION\w*|HOMOGLYPH_ACTION|HIDDEN_ACTION)\}\}/;
    for (const technique of TECHNIQUES) {
      expect(
        actionPattern.test(technique.template),
        `Technique ${technique.id} should have an action placeholder`,
      ).toBe(true);
    }
  });

  it('getTechniqueById returns correct technique', () => {
    const tech = getTechniqueById('di-override-system');
    expect(tech).toBeDefined();
    expect(tech!.name).toBe('System Prompt Override');
  });

  it('getTechniqueById returns undefined for invalid ID', () => {
    expect(getTechniqueById('nonexistent')).toBeUndefined();
  });

  it('getTechniquesByCategory filters correctly', () => {
    const directInjections = getTechniquesByCategory('direct_instruction');
    expect(directInjections.length).toBeGreaterThan(0);
    for (const t of directInjections) {
      expect(t.category).toBe('direct_instruction');
    }
  });

  it('getTechniqueBySeverity filters correctly', () => {
    const critical = getTechniqueBySeverity('critical');
    expect(critical.length).toBeGreaterThan(0);
    for (const t of critical) {
      expect(t.severity).toBe('critical');
    }
  });

  it('all categories have at least one technique', () => {
    for (const category of Object.keys(XPIA_CATEGORIES)) {
      const techs = getTechniquesByCategory(category as keyof typeof XPIA_CATEGORIES);
      expect(techs.length, `Category ${category} has no techniques`).toBeGreaterThan(0);
    }
  });

  it('no technique template contains "XPIA" (case-insensitive)', () => {
    for (const technique of TECHNIQUES) {
      expect(
        technique.template.toLowerCase().includes('xpia'),
        `Technique ${technique.id} template contains "XPIA" — LLMs will flag this`,
      ).toBe(false);
    }
  });

  it('no technique name contains "XPIA" (case-insensitive)', () => {
    for (const technique of TECHNIQUES) {
      expect(
        technique.name.toLowerCase().includes('xpia'),
        `Technique ${technique.id} name contains "XPIA"`,
      ).toBe(false);
    }
  });

  it('no technique description contains "XPIA" (case-insensitive)', () => {
    for (const technique of TECHNIQUES) {
      expect(
        technique.description.toLowerCase().includes('xpia'),
        `Technique ${technique.id} description contains "XPIA"`,
      ).toBe(false);
    }
  });
});

describe('Security Frameworks', () => {
  const frameworkIds = Object.keys(XPIA_FRAMEWORKS) as XPIAFramework[];
  const categoryIds = Object.keys(XPIA_CATEGORIES) as XPIACategory[];

  it('should have at least one framework defined', () => {
    expect(frameworkIds.length).toBeGreaterThanOrEqual(3);
  });

  it('every framework should have label, description, and version', () => {
    for (const fw of frameworkIds) {
      const info = XPIA_FRAMEWORKS[fw];
      expect(info.label).toBeTruthy();
      expect(info.description).toBeTruthy();
      expect(info.version).toBeTruthy();
    }
  });

  it('FRAMEWORK_CATEGORIES should only reference valid categories', () => {
    for (const fw of frameworkIds) {
      for (const cat of Object.keys(FRAMEWORK_CATEGORIES[fw])) {
        expect(categoryIds, `Framework ${fw} references unknown category "${cat}"`).toContain(cat);
      }
    }
  });

  it('MITRE ATLAS should map all 10 categories', () => {
    const atlasCats = Object.keys(FRAMEWORK_CATEGORIES.mitre_atlas);
    expect(atlasCats.length).toBe(10);
    for (const cat of categoryIds) {
      expect(atlasCats, `MITRE ATLAS missing category "${cat}"`).toContain(cat);
    }
  });

  it('OWASP LLM Top 10 should map all 10 categories', () => {
    const owaspCats = Object.keys(FRAMEWORK_CATEGORIES.owasp_llm_top10);
    expect(owaspCats.length).toBe(10);
  });

  it('Greshake should map 8 categories (excludes encoding_evasion, persona_switching)', () => {
    const greshakeCats = Object.keys(FRAMEWORK_CATEGORIES.greshake);
    expect(greshakeCats.length).toBe(8);
    expect(greshakeCats).not.toContain('encoding_evasion');
    expect(greshakeCats).not.toContain('persona_switching');
  });

  it('getCategoriesForFramework returns correct categories', () => {
    const atlasCats = getCategoriesForFramework('mitre_atlas');
    expect(atlasCats.length).toBe(10);
    const greshakeCats = getCategoriesForFramework('greshake');
    expect(greshakeCats.length).toBe(8);
  });

  it('getFrameworkRef returns reference ID for mapped categories', () => {
    expect(getFrameworkRef('mitre_atlas', 'direct_instruction')).toBe('AML.T0051.000');
    expect(getFrameworkRef('owasp_llm_top10', 'data_exfiltration')).toBe('LLM02');
    expect(getFrameworkRef('owasp_llm_top10', 'tool_manipulation')).toBe('LLM06');
    expect(getFrameworkRef('greshake', 'context_manipulation')).toBe('Indirect');
  });

  it('getFrameworkRef returns undefined for unmapped categories', () => {
    expect(getFrameworkRef('greshake', 'encoding_evasion')).toBeUndefined();
    expect(getFrameworkRef('greshake', 'persona_switching')).toBeUndefined();
  });

  it('every framework reference ID should be a non-empty string', () => {
    for (const fw of frameworkIds) {
      for (const [cat, ref] of Object.entries(FRAMEWORK_CATEGORIES[fw])) {
        expect(ref, `Framework ${fw}, category ${cat} has empty ref`).toBeTruthy();
        expect(typeof ref).toBe('string');
      }
    }
  });
});
