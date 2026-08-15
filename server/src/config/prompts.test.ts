import { describe, it, expect } from 'vitest';
import {
  RESEARCH_FRAMING,
  DEFAULT_RESEARCH_FRAMING,
  DOCUMENT_PROMPTS,
  PAYLOAD_PROMPTS,
  PAGE_PROMPTS,
  ACTION_PROMPTS,
  interpolate,
  getPromptRegistry,
  getAllPrompts,
} from './prompts';

describe('Prompt Config', () => {
  describe('RESEARCH_FRAMING', () => {
    it('should have prompts for all three providers', () => {
      expect(RESEARCH_FRAMING.openai).toBeTruthy();
      expect(RESEARCH_FRAMING.google).toBeTruthy();
      expect(RESEARCH_FRAMING.xai).toBeTruthy();
    });

    it('should set default to openai', () => {
      expect(DEFAULT_RESEARCH_FRAMING).toBe(RESEARCH_FRAMING.openai);
    });
  });

  describe('DOCUMENT_PROMPTS', () => {
    it('should have system and user prompts', () => {
      expect(DOCUMENT_PROMPTS.system).toBeTruthy();
      expect(DOCUMENT_PROMPTS.user).toBeTruthy();
    });

    it('user template should contain all expected placeholders', () => {
      expect(DOCUMENT_PROMPTS.user).toContain('{{DOC_TYPE_DESCRIPTION}}');
      expect(DOCUMENT_PROMPTS.user).toContain('{{TECHNIQUE_NAME}}');
      expect(DOCUMENT_PROMPTS.user).toContain('{{EMBEDDING_METHOD}}');
      expect(DOCUMENT_PROMPTS.user).toContain('{{RAW_PAYLOAD}}');
      expect(DOCUMENT_PROMPTS.user).toContain('{{CONTENT_SCHEMA}}');
    });

    it('should have descriptions for all 14 doc types', () => {
      const types = ['docx', 'htm', 'pptx', 'xlsx', 'pdf', 'png', 'svg', 'csv', 'md', 'ics', 'vcf', 'json', 'yaml', 'rtf'];
      for (const t of types) {
        expect(DOCUMENT_PROMPTS.docTypeDescriptions[t], `Missing description for ${t}`).toBeTruthy();
      }
    });

    it('should have content schemas for all 14 doc types', () => {
      const types = ['docx', 'htm', 'pptx', 'xlsx', 'pdf', 'png', 'svg', 'csv', 'md', 'ics', 'vcf', 'json', 'yaml', 'rtf'];
      for (const t of types) {
        expect(DOCUMENT_PROMPTS.contentSchemas[t], `Missing schema for ${t}`).toBeTruthy();
      }
    });

    it('should have valid temperature and maxTokens', () => {
      expect(DOCUMENT_PROMPTS.maxTokens).toBeGreaterThan(0);
      expect(DOCUMENT_PROMPTS.temperature).toBeGreaterThan(0);
      expect(DOCUMENT_PROMPTS.temperature).toBeLessThanOrEqual(2);
    });
  });

  describe('PAYLOAD_PROMPTS', () => {
    it('should have system and user prompts', () => {
      expect(PAYLOAD_PROMPTS.system).toBeTruthy();
      expect(PAYLOAD_PROMPTS.user).toBeTruthy();
    });

    it('user template should contain placeholders', () => {
      expect(PAYLOAD_PROMPTS.user).toContain('{{PAYLOAD_COUNT}}');
      expect(PAYLOAD_PROMPTS.user).toContain('{{PAYLOAD_SUMMARY}}');
    });

    it('should have valid token limits', () => {
      expect(PAYLOAD_PROMPTS.maxTokensPerPayload).toBeGreaterThan(0);
      expect(PAYLOAD_PROMPTS.maxTokensCap).toBeGreaterThan(PAYLOAD_PROMPTS.maxTokensPerPayload);
    });
  });

  describe('PAGE_PROMPTS', () => {
    it('should have system and user prompts', () => {
      expect(PAGE_PROMPTS.system).toBeTruthy();
      expect(PAGE_PROMPTS.user).toBeTruthy();
    });

    it('user template should contain placeholders', () => {
      expect(PAGE_PROMPTS.user).toContain('{{PAGE_TITLE}}');
      expect(PAGE_PROMPTS.user).toContain('{{EMBEDDING_METHOD}}');
    });
  });

  describe('ACTION_PROMPTS', () => {
    it('should have prompts for all four purposes', () => {
      expect(ACTION_PROMPTS.custom_action).toBeTruthy();
      expect(ACTION_PROMPTS.document_enhance).toBeTruthy();
      expect(ACTION_PROMPTS.payload_enhance).toBeTruthy();
      expect(ACTION_PROMPTS.page_enhance).toBeTruthy();
    });
  });

  describe('interpolate', () => {
    it('replaces single placeholder', () => {
      expect(interpolate('Hello {{NAME}}!', { NAME: 'World' })).toBe('Hello World!');
    });

    it('replaces multiple placeholders', () => {
      expect(interpolate('{{A}} and {{B}}', { A: '1', B: '2' })).toBe('1 and 2');
    });

    it('leaves unknown placeholders unchanged', () => {
      expect(interpolate('{{KNOWN}} {{UNKNOWN}}', { KNOWN: 'ok' })).toBe('ok {{UNKNOWN}}');
    });

    it('replaces multiple occurrences of the same placeholder', () => {
      expect(interpolate('{{X}} + {{X}}', { X: '5' })).toBe('5 + 5');
    });
  });

  describe('getPromptRegistry', () => {
    it('returns all 13 editable prompt entries', () => {
      const registry = getPromptRegistry();
      expect(registry.length).toBe(16);
    });

    it('every entry has required fields', () => {
      for (const entry of getPromptRegistry()) {
        expect(entry.key).toBeTruthy();
        expect(entry.category).toBeTruthy();
        expect(entry.label).toBeTruthy();
        expect(entry.description).toBeTruthy();
        expect(entry.defaultValue).toBeTruthy();
      }
    });

    it('has unique keys', () => {
      const keys = getPromptRegistry().map(e => e.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('covers all expected categories', () => {
      const categories = new Set(getPromptRegistry().map(e => e.category));
      expect(categories).toContain('Research Framing');
      expect(categories).toContain('Documents');
      expect(categories).toContain('Payloads');
      expect(categories).toContain('Pages');
      expect(categories).toContain('Actions');
    });
  });

  describe('getAllPrompts', () => {
    it('returns entries with currentValue and isOverridden fields', async () => {
      const all = await getAllPrompts();
      expect(all.length).toBe(16);
      for (const p of all) {
        expect(typeof p.currentValue).toBe('string');
        expect(typeof p.isOverridden).toBe('boolean');
        // Without DB overrides, currentValue should equal defaultValue
        expect(p.currentValue).toBe(p.defaultValue);
        expect(p.isOverridden).toBe(false);
      }
    });
  });
});
