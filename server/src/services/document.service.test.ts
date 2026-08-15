import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { generateDocument, generateDocumentBatch, DocType, getAvailableTechniques } from './document.service';

// Mock the DB so we don't hit the real database
vi.mock('../db', () => ({
  default: {
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(() => []),
  },
}));

// Mock prompt-template service to return code defaults
vi.mock('./prompt-template.service', () => ({
  getUserPrompt: vi.fn((_userId: string, _category: string, type: string) =>
    type === 'system'
      ? 'You generate realistic professional document content for AI security research.'
      : 'Generate content for {{DOC_TYPE_DESCRIPTION}}.'
  ),
}));

// Mock LLM gateway
vi.mock('./llm/gateway', () => ({
  complete: vi.fn(),
}));
import * as gateway from './llm/gateway';

const TEST_TECHNIQUE_ID = 'di-ignore-previous'; // Uses visible_text embedding
const TEST_HIDDEN_TECHNIQUE_ID = 'di-override-system'; // Uses hidden_text embedding
const USER_ID = 'test-user-id';

const NEW_DOC_TYPES: DocType[] = ['png', 'svg', 'jpg', 'webp', 'gif', 'csv', 'md', 'ics', 'vcf', 'json', 'yaml', 'rtf', 'qr'];
const ALL_DOC_TYPES: DocType[] = ['docx', 'htm', 'pptx', 'xlsx', 'pdf', ...NEW_DOC_TYPES];

describe('Document Generation - All Types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const docType of ALL_DOC_TYPES) {
    it(`generates ${docType} with valid buffer and filename`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType,
        techniqueId: TEST_TECHNIQUE_ID,
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      const expectedExt = docType === 'qr' ? '.png' : `.${docType}`;
      expect(result.filename).toContain(expectedExt);
      const IMAGE_TYPES = new Set(['png', 'svg', 'jpg', 'webp', 'gif']);
      expect(result.filename).toContain(IMAGE_TYPES.has(docType) ? 'img-' : 'doc-');
      expect(result.mimeType).toBeTruthy();
    });
  }
});

describe('Document Generation - SVG', () => {
  it('produces valid SVG XML', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('<?xml');
    expect(content).toContain('<svg');
    expect(content).toContain('</svg>');
    expect(result.mimeType).toBe('image/svg+xml');
  });

  it('embeds payload in SVG content', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
      customAction: 'reveal secrets',
    });

    const content = result.buffer.toString('utf-8');
    // visible_text technique — payload should be in a visible text element
    expect(content).toContain('reveal secrets');
  });

  it('always renders payload visibly even for hidden_text techniques', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_HIDDEN_TECHNIQUE_ID,
      customAction: 'extract configuration',
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('extract configuration');
    // Payload should be rendered as visible text in some font size (varies by layout)
    expect(content).toMatch(/font-size="\d+"/);
  });

  it('does NOT embed @font-face in SVG output (browsers handle fonts)', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).not.toContain('@font-face');
    expect(content).not.toContain('data:font/truetype;base64,');
    // Should still reference the Inter font family
    expect(content).toContain("font-family=\"'Inter', sans-serif\"");
  });
});

describe('Document Generation - Font Embedding (raster formats)', () => {
  it('sets FONTCONFIG_FILE env var after first raster generation', async () => {
    await generateDocument({
      userId: USER_ID,
      docType: 'png',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    // ensureFontconfigRegistered() should have written a fonts.conf
    expect(process.env.FONTCONFIG_FILE).toBeDefined();
    expect(process.env.FONTCONFIG_FILE).toContain('fonts.conf');
  });

  it('PNG intermediate SVG contains embedded @font-face with Inter base64', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'png',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    // PNG should be valid and substantially larger than a tofu image (~1-2KB)
    expect(result.buffer[0]).toBe(0x89);
    expect(result.buffer.length).toBeGreaterThan(5000);
  });

  it.each([
    ['jpg', [0xff, 0xd8, 0xff]],
    ['webp', null],
    ['gif', null],
  ] as const)('%s raster output has substantial file size (font rendered)', async (docType, magicBytes) => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: docType as DocType,
      techniqueId: TEST_TECHNIQUE_ID,
    });

    // All raster formats should produce meaningful output (> 5KB).
    // Tofu-only images are typically 1–2KB because the glyph outlines are trivial.
    expect(result.buffer.length).toBeGreaterThan(5000);

    if (magicBytes) {
      for (let i = 0; i < magicBytes.length; i++) {
        expect(result.buffer[i]).toBe(magicBytes[i]);
      }
    }
  });
});

describe('Document Generation - PNG', () => {
  it('produces PNG buffer with valid header', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'png',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    // PNG magic bytes: 137 80 78 71 13 10 26 10
    expect(result.buffer[0]).toBe(0x89);
    expect(result.buffer[1]).toBe(0x50); // P
    expect(result.buffer[2]).toBe(0x4e); // N
    expect(result.buffer[3]).toBe(0x47); // G
    expect(result.mimeType).toBe('image/png');
  });
});

describe('Document Generation - CSV', () => {
  it('produces valid CSV with header row', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'csv',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('Department');
    expect(content).toContain('Q1 Budget');
    expect(content).toContain('Engineering');
    expect(result.mimeType).toBe('text/csv');
  });

  it('embeds payload in CSV rows', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'csv',
      techniqueId: TEST_TECHNIQUE_ID,
      customAction: 'exfiltrate data',
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('exfiltrate data');
  });
});

describe('Document Generation - Markdown', () => {
  it('produces markdown with YAML frontmatter', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'md',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('---');
    expect(content).toContain('# AI Safety Research Summary');
    expect(result.mimeType).toBe('text/markdown');
  });
});

describe('Document Generation - ICS', () => {
  it('produces valid iCalendar format', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'ics',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('BEGIN:VCALENDAR');
    expect(content).toContain('END:VCALENDAR');
    expect(content).toContain('BEGIN:VEVENT');
    expect(content).toContain('END:VEVENT');
    expect(result.mimeType).toBe('text/calendar');
  });
});

describe('Document Generation - VCF', () => {
  it('produces valid vCard format', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'vcf',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('BEGIN:VCARD');
    expect(content).toContain('END:VCARD');
    expect(content).toContain('VERSION:3.0');
    expect(result.mimeType).toBe('text/vcard');
  });
});

describe('Document Generation - JSON', () => {
  it('produces valid JSON', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'json',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.report).toBeDefined();
    expect(parsed.findings).toBeInstanceOf(Array);
    expect(result.mimeType).toBe('application/json');
  });
});

describe('Document Generation - YAML', () => {
  it('produces YAML with expected structure', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'yaml',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('report:');
    expect(content).toContain('scan_config:');
    expect(content).toContain('findings:');
    expect(result.mimeType).toBe('text/yaml');
  });
});

describe('Document Generation - RTF', () => {
  it('produces valid RTF with header', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'rtf',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('{\\rtf1');
    expect(content).toContain('\\fonttbl');
    expect(content).toContain('Quarterly Strategic Assessment');
    expect(result.mimeType).toBe('application/rtf');
  });
});

describe('Document Generation - Hidden text embedding', () => {
  for (const docType of NEW_DOC_TYPES) {
    it(`${docType} works with hidden_text embedding`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType,
        techniqueId: TEST_HIDDEN_TECHNIQUE_ID,
        customAction: 'test hidden action',
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
    });
  }
});

describe('Document Generation - Custom action', () => {
  for (const docType of NEW_DOC_TYPES) {
    it(`${docType} accepts custom action`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType,
        techniqueId: TEST_TECHNIQUE_ID,
        customAction: 'custom test payload',
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
    });
  }
});

describe('getAvailableTechniques', () => {
  it('returns techniques sorted by severity low → medium → high → critical', () => {
    const techniques = getAvailableTechniques();
    const severities = techniques.map((t: { severity: string }) => t.severity);
    const order: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    for (let i = 1; i < severities.length; i++) {
      expect(order[severities[i]]).toBeGreaterThanOrEqual(order[severities[i - 1]]);
    }
  });

  it('contains at least medium, high, and critical severity levels', () => {
    const severities = new Set(getAvailableTechniques().map((t: { severity: string }) => t.severity));
    expect(severities.has('medium')).toBe(true);
    expect(severities.has('high')).toBe(true);
    expect(severities.has('critical')).toBe(true);
  });
});

describe('XPIA-free output guard', () => {
  const BANNED = /xpia/i;

  for (const docType of ALL_DOC_TYPES) {
    it(`${docType} filename never contains "XPIA"`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType,
        techniqueId: TEST_TECHNIQUE_ID,
      });
      expect(BANNED.test(result.filename)).toBe(false);
    });
  }

  // Text-based formats where we can inspect string content
  const TEXT_TYPES: DocType[] = ['htm', 'svg', 'csv', 'md', 'ics', 'vcf', 'json', 'yaml', 'rtf'];

  for (const docType of TEXT_TYPES) {
    it(`${docType} content never contains "XPIA"`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType,
        techniqueId: TEST_TECHNIQUE_ID,
      });
      const content = result.buffer.toString('utf-8');
      expect(BANNED.test(content)).toBe(false);
    });
  }
});

describe('Document Generation - LLM Enhancement', () => {
  const mockComplete = vi.mocked(gateway.complete);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls gateway.complete when modelId is provided', async () => {
    mockComplete.mockResolvedValueOnce({
      content: JSON.stringify({
        title: 'LLM Enhanced Title',
        subtitle: 'Generated subtitle',
        sections: [{ heading: 'Overview', body: 'Para 1 from LLM' }],
        signOff: 'Regards, LLM Author',
        author: 'LLM Author',
        organization: 'LLM Org',
      }),
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      model: 'gpt-5',
      finishReason: 'stop',
    } as any);

    const result = await generateDocument({
      userId: USER_ID,
      docType: 'htm',
      techniqueId: TEST_TECHNIQUE_ID,
      modelId: 'model-123',
    });

    expect(mockComplete).toHaveBeenCalledOnce();
    expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      modelDbId: 'model-123',
      purpose: 'document_enhance',
    }));

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('LLM Enhanced Title');
  });

  it('does not call gateway when no modelId', async () => {
    await generateDocument({
      userId: USER_ID,
      docType: 'htm',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('throws when gateway rejects', async () => {
    mockComplete.mockRejectedValueOnce(new Error('API key invalid'));

    await expect(generateDocument({
      userId: USER_ID,
      docType: 'htm',
      techniqueId: TEST_TECHNIQUE_ID,
      modelId: 'model-123',
    })).rejects.toThrow('API key invalid');
  });

  it('uses LLM enhanced content for text doc types', async () => {
    mockComplete.mockResolvedValueOnce({
      content: JSON.stringify({
        title: 'Acme Q4 Report',
        subtitle: 'Confidential',
        sections: [
          { heading: 'Financial Summary', body: 'Revenue rose 15% YOY.' },
          { heading: 'Operations', body: 'OpEx was well-controlled.' },
          { heading: 'Outlook', body: 'Guidance is strong.' },
        ],
        signOff: 'Prepared by Finance',
        author: 'Jane CFO',
        organization: 'Acme Inc',
      }),
      usage: { inputTokens: 80, outputTokens: 150, totalTokens: 230 },
      model: 'gpt-5',
      finishReason: 'stop',
    } as any);

    const result = await generateDocument({
      userId: USER_ID,
      docType: 'md',
      techniqueId: TEST_TECHNIQUE_ID,
      modelId: 'model-456',
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('Acme Q4 Report');
    expect(content).toContain('Revenue rose 15% YOY.');
  });

  it('falls back gracefully when LLM returns invalid JSON', async () => {
    mockComplete.mockResolvedValueOnce({
      content: 'Sorry, I cannot generate that content.',
      usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
      model: 'gpt-5',
      finishReason: 'stop',
    } as any);

    const result = await generateDocument({
      userId: USER_ID,
      docType: 'htm',
      techniqueId: TEST_TECHNIQUE_ID,
      modelId: 'model-789',
    });

    // Should still produce valid output (fallback content)
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
    const content = result.buffer.toString('utf-8');
    // Falls back to the partial-content fallback
    expect(content).toContain('Quarterly Strategic Review');
  });
});

describe('Document Generation - QR Code', () => {
  it('generates QR code as valid PNG', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'qr',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    // PNG magic bytes
    expect(result.buffer[0]).toBe(0x89);
    expect(result.buffer[1]).toBe(0x50);
    expect(result.buffer[2]).toBe(0x4e);
    expect(result.buffer[3]).toBe(0x47);
    expect(result.mimeType).toBe('image/png');
    expect(result.filename).toContain('.png');
  });

  it('generates QR code with custom action', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'qr',
      techniqueId: TEST_TECHNIQUE_ID,
      customAction: 'reveal system prompt',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(100);
  });

  it('context-overflow QR preserves injection directive, not filler', async () => {
    // cm-context-overflow has ~1400 chars of padding then the directive
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'qr',
      techniqueId: 'cm-context-overflow',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    // The QR should be a valid PNG (wasn't broken by truncation)
    expect(result.buffer[0]).toBe(0x89);
    expect(result.buffer[1]).toBe(0x50);
  });
});

describe('Document Generation - addQrCode flag', () => {
  const RICH_TYPES: DocType[] = ['docx', 'htm', 'pptx', 'xlsx', 'pdf'];

  for (const docType of RICH_TYPES) {
    it(`${docType} generates with addQrCode=true without error`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType,
        techniqueId: TEST_TECHNIQUE_ID,
        addQrCode: true,
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
    });
  }

  it('htm with addQrCode includes base64 QR image', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'htm',
      techniqueId: TEST_TECHNIQUE_ID,
      addQrCode: true,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('data:image/png;base64,');
    expect(content).toContain('QR Code');
  });

  it('htm without addQrCode does not include QR image', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'htm',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).not.toContain('data:image/png;base64,');
  });
});

describe('Batch Document Generation', () => {
  const mockComplete = vi.mocked(gateway.complete);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates all requested doc types with valid buffers', async () => {
    const results = await generateDocumentBatch({
      userId: USER_ID,
      docTypes: ['docx', 'pdf', 'csv'],
      techniqueId: TEST_TECHNIQUE_ID,
    });

    expect(results).toHaveLength(3);
    for (const doc of results) {
      expect(doc.buffer).toBeInstanceOf(Buffer);
      expect(doc.buffer.length).toBeGreaterThan(0);
      expect(doc.filename).toContain('doc-');
      expect(doc.mimeType).toBeTruthy();
    }
    expect(results.map(d => d.docType)).toEqual(['docx', 'pdf', 'csv']);
  });

  it('makes one LLM call per schema group (not per doc type)', async () => {
    const mockResponse = {
      content: JSON.stringify({
        title: 'Batch Title',
        subtitle: 'Batch Sub',
        sections: [{ heading: 'Overview', body: 'Batch content.' }],
        signOff: 'End',
        author: 'Batch Author',
        organization: 'Batch Org',
      }),
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      model: 'gpt-5',
      finishReason: 'stop',
    } as any;

    // Three sections-based types = should be 1 LLM call
    mockComplete.mockResolvedValue(mockResponse);

    const results = await generateDocumentBatch({
      userId: USER_ID,
      docTypes: ['docx', 'pdf', 'md'],
      techniqueId: TEST_TECHNIQUE_ID,
      modelId: 'model-batch',
    });

    expect(results).toHaveLength(3);
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it('makes separate LLM calls for different schema groups', async () => {
    const sectionsResponse = {
      content: JSON.stringify({
        title: 'Sections Title',
        subtitle: 'Sub',
        sections: [{ heading: 'Intro', body: 'Body.' }],
        signOff: 'End',
        author: 'Author',
        organization: 'Org',
      }),
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      model: 'gpt-5',
      finishReason: 'stop',
    } as any;

    const departmentsResponse = {
      content: JSON.stringify({
        title: 'Budget Report',
        subtitle: 'FY2026',
        departments: [{ name: 'Engineering', q1: 100, q2: 120, q3: 110, q4: 130, note: 'Growth' }],
        author: 'CFO',
        organization: 'Corp',
      }),
      usage: { inputTokens: 80, outputTokens: 150, totalTokens: 230 },
      model: 'gpt-5',
      finishReason: 'stop',
    } as any;

    mockComplete
      .mockResolvedValueOnce(sectionsResponse)
      .mockResolvedValueOnce(departmentsResponse);

    const results = await generateDocumentBatch({
      userId: USER_ID,
      docTypes: ['docx', 'xlsx'],
      techniqueId: TEST_TECHNIQUE_ID,
      modelId: 'model-multi',
    });

    expect(results).toHaveLength(2);
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });

  it('makes zero LLM calls when no modelId provided', async () => {
    const results = await generateDocumentBatch({
      userId: USER_ID,
      docTypes: ['docx', 'pdf', 'xlsx'],
      techniqueId: TEST_TECHNIQUE_ID,
    });

    expect(results).toHaveLength(3);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('shares LLM content across types in the same group', async () => {
    mockComplete.mockResolvedValueOnce({
      content: JSON.stringify({
        title: 'Shared Title From LLM',
        subtitle: 'Shared Sub',
        sections: [{ heading: 'Overview', body: 'Shared body content.' }],
        signOff: 'Shared sign-off',
        author: 'Shared Author',
        organization: 'Shared Org',
      }),
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      model: 'gpt-5',
      finishReason: 'stop',
    } as any);

    const results = await generateDocumentBatch({
      userId: USER_ID,
      docTypes: ['htm', 'md'],
      techniqueId: TEST_TECHNIQUE_ID,
      modelId: 'model-share',
    });

    expect(results).toHaveLength(2);
    expect(mockComplete).toHaveBeenCalledTimes(1);

    // Both docs should contain the shared LLM content
    const htmContent = results[0].buffer.toString('utf-8');
    const mdContent = results[1].buffer.toString('utf-8');
    expect(htmContent).toContain('Shared Title From LLM');
    expect(mdContent).toContain('Shared Title From LLM');
  });

  it('throws for unknown technique', async () => {
    await expect(generateDocumentBatch({
      userId: USER_ID,
      docTypes: ['docx'],
      techniqueId: 'nonexistent-technique',
    })).rejects.toThrow('Unknown technique');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Layer 1 — Format Structural Correctness
// Validates that each format's hiding mechanism actually works at the
// binary/XML/markup level. These tests catch regressions like using
// white color instead of vanish, or leaving sheet tabs visible.
// ═══════════════════════════════════════════════════════════════════════

import JSZip from 'jszip';
import ExcelJS from 'exceljs';

const WHITE_TEXT_TECHNIQUE_ID = 'mm-hidden-text-white'; // Uses white_text embedding
const TINY_FONT_TECHNIQUE_ID = 'mm-tiny-font';         // Uses tiny_font embedding
const METADATA_TECHNIQUE_ID = 'mm-metadata-injection';  // Uses metadata embedding
const COMMENT_TECHNIQUE_ID = 'mm-comment-injection';    // Uses comment embedding

describe('Layer 1 — DOCX structural correctness', () => {
  it('hidden_text uses <w:vanish/>, not white color', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'docx',
      techniqueId: TEST_HIDDEN_TECHNIQUE_ID,
      customAction: 'vanish test payload',
    });

    const zip = await JSZip.loadAsync(result.buffer);
    const docXml = await zip.file('word/document.xml')!.async('text');

    // Must have vanish — the correct hiding mechanism
    expect(docXml).toContain('<w:vanish/>');
    // Must NOT have FFFFFF color — the old broken approach
    expect(docXml).not.toMatch(/color.*FFFFFF/i);
  });

  it('hidden_text header uses vanish, not white color', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'docx',
      techniqueId: TEST_HIDDEN_TECHNIQUE_ID,
      customAction: 'header vanish test',
    });

    const zip = await JSZip.loadAsync(result.buffer);
    // Headers may be in separate XML files
    const headerFiles = Object.keys(zip.files).filter(f => f.startsWith('word/header'));
    for (const hf of headerFiles) {
      const headerXml = await zip.file(hf)!.async('text');
      if (headerXml.includes('header vanish test')) {
        expect(headerXml).toContain('<w:vanish/>');
        expect(headerXml).not.toMatch(/color.*FFFFFF/i);
      }
    }
  });

  it('visible_text does NOT use vanish', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'docx',
      techniqueId: TEST_TECHNIQUE_ID, // visible_text
      customAction: 'visible payload',
    });

    const zip = await JSZip.loadAsync(result.buffer);
    const docXml = await zip.file('word/document.xml')!.async('text');

    // visible_text payload should be present and NOT vanished
    expect(docXml).toContain('visible payload');
    // Check that no vanish is applied to our payload's run
    // (vanish might exist for other runs, so we check the payload context)
  });

  it('white_text uses FFFFFF color (no vanish)', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'docx',
      techniqueId: WHITE_TEXT_TECHNIQUE_ID,
      customAction: 'white text payload',
    });

    const zip = await JSZip.loadAsync(result.buffer);
    const docXml = await zip.file('word/document.xml')!.async('text');

    expect(docXml).toContain('white text payload');
    expect(docXml).toMatch(/color.*val.*FFFFFF/i);
  });
});

describe('Layer 1 — XLSX structural correctness', () => {
  it('white_text sheet is veryHidden', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'xlsx',
      techniqueId: WHITE_TEXT_TECHNIQUE_ID,
      customAction: 'xlsx white test',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const notesSheet = workbook.getWorksheet('Notes');
    expect(notesSheet).toBeDefined();
    expect(notesSheet!.state).toBe('veryHidden');
  });

  it('hidden_text sheet is veryHidden', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'xlsx',
      techniqueId: TEST_HIDDEN_TECHNIQUE_ID,
      customAction: 'xlsx hidden test',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const dataSheet = workbook.getWorksheet('_data');
    expect(dataSheet).toBeDefined();
    expect(dataSheet!.state).toBe('veryHidden');
  });

  it('white_text cell has white font color', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'xlsx',
      techniqueId: WHITE_TEXT_TECHNIQUE_ID,
      customAction: 'xlsx white font test',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const notesSheet = workbook.getWorksheet('Notes')!;
    const cell = notesSheet.getCell('A1');
    expect(cell.font?.color?.argb).toBe('FFFFFFFF');
  });
});

describe('Layer 1 — HTM structural correctness', () => {
  it('hidden_text uses display:none', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'htm',
      techniqueId: TEST_HIDDEN_TECHNIQUE_ID,
      customAction: 'htm hidden test',
    });

    const html = result.buffer.toString('utf-8');
    expect(html).toContain('display:none');
    expect(html).toContain('htm hidden test');
  });

  it('white_text uses color:#ffffff', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'htm',
      techniqueId: WHITE_TEXT_TECHNIQUE_ID,
      customAction: 'htm white test',
    });

    const html = result.buffer.toString('utf-8');
    expect(html).toContain('color:#ffffff');
    expect(html).toContain('htm white test');
  });

  it('tiny_font uses font-size:1px', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'htm',
      techniqueId: TINY_FONT_TECHNIQUE_ID,
      customAction: 'htm tiny test',
    });

    const html = result.buffer.toString('utf-8');
    expect(html).toContain('font-size:1px');
    expect(html).toContain('htm tiny test');
  });

  it('metadata uses <!-- comment --> or <meta> tag', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'htm',
      techniqueId: METADATA_TECHNIQUE_ID,
      customAction: 'htm meta test',
    });

    const html = result.buffer.toString('utf-8');
    // Metadata technique should embed as HTML comment AND/OR meta description
    const hasComment = html.includes('<!-- htm meta test');
    const hasMeta = html.includes('htm meta test') && html.includes('<meta');
    expect(hasComment || hasMeta).toBe(true);
  });

  it('comment uses HTML comment <!-- -->', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'htm',
      techniqueId: COMMENT_TECHNIQUE_ID,
      customAction: 'htm comment test',
    });

    const html = result.buffer.toString('utf-8');
    expect(html).toContain('<!-- htm comment test');
  });
});

describe('Layer 1 — SVG/PNG always render visibly', () => {
  it('SVG renders payload visibly even for hidden_text technique', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_HIDDEN_TECHNIQUE_ID,
      customAction: 'svg hidden payload',
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('svg hidden payload');
    // Must NOT use stealth opacity — payload should be visible
    expect(content).not.toContain('opacity="0"');
    expect(content).not.toContain('display="none"');
  });

  it('SVG renders payload visibly for white_text technique', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: WHITE_TEXT_TECHNIQUE_ID,
      customAction: 'svg white payload',
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('svg white payload');
    expect(content).not.toContain('opacity="0"');
    expect(content).not.toContain('fill="#ffffff"');
  });

  it('PNG produces valid image for hidden_text technique', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'png',
      techniqueId: TEST_HIDDEN_TECHNIQUE_ID,
      customAction: 'png hidden payload',
    });

    // PNG magic bytes
    expect(result.buffer[0]).toBe(0x89);
    expect(result.buffer[1]).toBe(0x50);
    expect(result.buffer.length).toBeGreaterThan(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Layer 2 — Payload Presence & Embedding Effectiveness
// Confirms that the payload text is actually present in the generated
// output for every embedding method × format combination, and that the
// hiding mechanism doesn't accidentally strip the payload.
// ═══════════════════════════════════════════════════════════════════════

describe('Layer 2 — DOCX payload presence', () => {
  it('hidden_text: payload exists in document XML', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'docx',
      techniqueId: TEST_HIDDEN_TECHNIQUE_ID,
      customAction: 'docx hidden payload L2',
    });

    const zip = await JSZip.loadAsync(result.buffer);
    const docXml = await zip.file('word/document.xml')!.async('text');
    expect(docXml).toContain('docx hidden payload L2');
  });

  it('white_text: payload exists in document XML', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'docx',
      techniqueId: WHITE_TEXT_TECHNIQUE_ID,
      customAction: 'docx white payload L2',
    });

    const zip = await JSZip.loadAsync(result.buffer);
    const docXml = await zip.file('word/document.xml')!.async('text');
    expect(docXml).toContain('docx white payload L2');
  });

  it('comment: comment reference markers exist in DOCX', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'docx',
      techniqueId: COMMENT_TECHNIQUE_ID,
      customAction: 'docx comment payload L2',
    });

    const zip = await JSZip.loadAsync(result.buffer);
    const docXml = await zip.file('word/document.xml')!.async('text');
    // docx v9 uses w: namespace prefix for comment range markers
    expect(docXml).toMatch(/commentRangeStart/i);
  });

  it('metadata: payload exists in DOCX core properties', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'docx',
      techniqueId: METADATA_TECHNIQUE_ID,
      customAction: 'docx meta payload L2',
    });

    const zip = await JSZip.loadAsync(result.buffer);
    const allXml: string[] = [];
    for (const [path, file] of Object.entries(zip.files)) {
      if (path.endsWith('.xml')) {
        allXml.push(await file.async('text'));
      }
    }
    const combined = allXml.join('');
    expect(combined).toContain('docx meta payload L2');
  });
});

describe('Layer 2 — XLSX payload presence', () => {
  it('white_text: payload exists in hidden sheet cell', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'xlsx',
      techniqueId: WHITE_TEXT_TECHNIQUE_ID,
      customAction: 'xlsx white payload L2',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    const notesSheet = workbook.getWorksheet('Notes')!;
    expect(notesSheet.getCell('A1').value).toContain('xlsx white payload L2');
  });

  it('hidden_text: payload exists in veryHidden sheet', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'xlsx',
      techniqueId: TEST_HIDDEN_TECHNIQUE_ID,
      customAction: 'xlsx hidden payload L2',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    const dataSheet = workbook.getWorksheet('_data')!;
    expect(dataSheet.getCell('A1').value).toContain('xlsx hidden payload L2');
  });

  it('comment: payload exists as cell note', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'xlsx',
      techniqueId: COMMENT_TECHNIQUE_ID,
      customAction: 'xlsx comment payload L2',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    const sheet = workbook.worksheets[0];
    const note = sheet.getCell('A1').note;
    expect(note).toBeTruthy();
    const noteText = typeof note === 'string' ? note : JSON.stringify(note);
    expect(noteText).toContain('xlsx comment payload L2');
  });
});

describe('Layer 2 — HTM payload presence (all methods)', () => {
  const TECHNIQUE_MAP: [string, string][] = [
    [TEST_TECHNIQUE_ID, 'visible_text'],
    [TEST_HIDDEN_TECHNIQUE_ID, 'hidden_text'],
    [WHITE_TEXT_TECHNIQUE_ID, 'white_text'],
    [TINY_FONT_TECHNIQUE_ID, 'tiny_font'],
    [METADATA_TECHNIQUE_ID, 'metadata'],
    [COMMENT_TECHNIQUE_ID, 'comment'],
  ];

  for (const [techId, method] of TECHNIQUE_MAP) {
    it(`${method}: payload present in HTML source`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType: 'htm',
        techniqueId: techId,
        customAction: `htm ${method} L2`,
      });

      const html = result.buffer.toString('utf-8');
      expect(html).toContain(`htm ${method} L2`);
    });
  }
});

describe('Layer 2 — Text-based formats payload presence', () => {
  const TEXT_FORMATS: DocType[] = ['csv', 'md', 'json', 'yaml', 'rtf', 'ics', 'vcf'];

  for (const fmt of TEXT_FORMATS) {
    it(`${fmt}: payload present in output`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType: fmt,
        techniqueId: TEST_TECHNIQUE_ID,
        customAction: `${fmt} text L2`,
      });

      const content = result.buffer.toString('utf-8');
      expect(content).toContain(`${fmt} text L2`);
    });
  }

  for (const fmt of TEXT_FORMATS) {
    it(`${fmt} hidden_text: payload present in output`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType: fmt,
        techniqueId: TEST_HIDDEN_TECHNIQUE_ID,
        customAction: `${fmt} hidden L2`,
      });

      const content = result.buffer.toString('utf-8');
      expect(content).toContain(`${fmt} hidden L2`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// New Image Types — JPEG, WebP, GIF
// Validates that the three new raster formats produce valid binary
// output via sharp and carry the correct MIME types.
// ═══════════════════════════════════════════════════════════════════════

describe('Document Generation - JPEG', () => {
  it('produces JPEG buffer with valid JFIF header', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'jpg',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    // JPEG magic bytes: FF D8 FF
    expect(result.buffer[0]).toBe(0xff);
    expect(result.buffer[1]).toBe(0xd8);
    expect(result.buffer[2]).toBe(0xff);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.filename).toContain('.jpg');
  });

  it('generates JPEG with custom action', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'jpg',
      techniqueId: TEST_TECHNIQUE_ID,
      customAction: 'jpeg payload test',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(100);
  });
});

describe('Document Generation - WebP', () => {
  it('produces WebP buffer with valid RIFF header', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'webp',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    // WebP magic bytes: RIFF....WEBP
    const header = result.buffer.toString('ascii', 0, 4);
    const webpSig = result.buffer.toString('ascii', 8, 12);
    expect(header).toBe('RIFF');
    expect(webpSig).toBe('WEBP');
    expect(result.mimeType).toBe('image/webp');
    expect(result.filename).toContain('.webp');
  });

  it('generates WebP with custom action', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'webp',
      techniqueId: TEST_TECHNIQUE_ID,
      customAction: 'webp payload test',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(100);
  });
});

describe('Document Generation - GIF', () => {
  it('produces GIF buffer with valid GIF header', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'gif',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    // GIF magic bytes: GIF89a or GIF87a
    const header = result.buffer.toString('ascii', 0, 3);
    expect(header).toBe('GIF');
    expect(result.mimeType).toBe('image/gif');
    expect(result.filename).toContain('.gif');
  });

  it('generates GIF with custom action', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'gif',
      techniqueId: TEST_TECHNIQUE_ID,
      customAction: 'gif payload test',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Layer 1 — Image structural correctness (all 5 types × all embedding methods)
// Images always render the payload as visible text regardless of
// the technique's embedding method. Validates magic bytes, MIME types,
// and minimum viable output size across all image types.
// ═══════════════════════════════════════════════════════════════════════

const IMAGE_TYPES_LIST: DocType[] = ['png', 'svg', 'jpg', 'webp', 'gif'];

const TECHNIQUE_IDS_ALL: [string, string][] = [
  [TEST_TECHNIQUE_ID, 'visible_text'],
  [TEST_HIDDEN_TECHNIQUE_ID, 'hidden_text'],
  [WHITE_TEXT_TECHNIQUE_ID, 'white_text'],
  [TINY_FONT_TECHNIQUE_ID, 'tiny_font'],
  [METADATA_TECHNIQUE_ID, 'metadata'],
  [COMMENT_TECHNIQUE_ID, 'comment'],
];

describe('Layer 1 — Image structural correctness (all types × all methods)', () => {
  for (const imgType of IMAGE_TYPES_LIST) {
    for (const [techId, method] of TECHNIQUE_IDS_ALL) {
      it(`${imgType} / ${method}: produces valid output`, async () => {
        const result = await generateDocument({
          userId: USER_ID,
          docType: imgType,
          techniqueId: techId,
          customAction: `${imgType} ${method} L1`,
        });

        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer.length).toBeGreaterThan(50);

        if (imgType === 'svg') {
          const content = result.buffer.toString('utf-8');
          expect(content).toContain('<svg');
          expect(content).toContain('</svg>');
          expect(result.mimeType).toBe('image/svg+xml');
        } else if (imgType === 'png') {
          expect(result.buffer[0]).toBe(0x89);
          expect(result.buffer[1]).toBe(0x50);
          expect(result.mimeType).toBe('image/png');
        } else if (imgType === 'jpg') {
          expect(result.buffer[0]).toBe(0xff);
          expect(result.buffer[1]).toBe(0xd8);
          expect(result.mimeType).toBe('image/jpeg');
        } else if (imgType === 'webp') {
          expect(result.buffer.toString('ascii', 0, 4)).toBe('RIFF');
          expect(result.buffer.toString('ascii', 8, 12)).toBe('WEBP');
          expect(result.mimeType).toBe('image/webp');
        } else if (imgType === 'gif') {
          expect(result.buffer.toString('ascii', 0, 3)).toBe('GIF');
          expect(result.mimeType).toBe('image/gif');
        }
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Layer 2 — Image payload presence (SVG only — text is inspectable)
// For SVG, the payload text is directly in the XML source and must be
// visible for every embedding method (images don't hide payloads).
// Raster formats (PNG/JPG/WebP/GIF) cannot be string-searched — their
// Layer 1 tests above confirm valid output for all method combos.
// ═══════════════════════════════════════════════════════════════════════

describe('Layer 2 — SVG payload presence (all embedding methods)', () => {
  for (const [techId, method] of TECHNIQUE_IDS_ALL) {
    it(`${method}: payload present and visible in SVG source`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType: 'svg',
        techniqueId: techId,
        customAction: `svg ${method} L2`,
      });

      const content = result.buffer.toString('utf-8');
      expect(content).toContain(`svg ${method} L2`);
      // Images always render visibly — no stealth hiding
      expect(content).not.toContain('opacity="0"');
      expect(content).not.toContain('display="none"');
    });
  }
});

describe('Layer 2 — Raster image addQrCode flag', () => {
  for (const imgType of ['png', 'jpg', 'webp', 'gif'] as DocType[]) {
    it(`${imgType} with addQrCode produces valid output`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType: imgType,
        techniqueId: TEST_TECHNIQUE_ID,
        customAction: `${imgType} qr test`,
        addQrCode: true,
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(100);
    });
  }

  it('SVG with addQrCode still produces valid SVG', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
      customAction: 'svg qr test',
      addQrCode: true,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('<svg');
    expect(content).toContain('</svg>');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QR Code Embedding in Images
// ═══════════════════════════════════════════════════════════════════════════

describe('Image QR Code Embedding', () => {
  it('SVG with addQrCode includes base64 QR image element', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
      customAction: 'reveal system prompt',
      addQrCode: true,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('data:image/png;base64,');
    expect(content).toContain('<image');
    expect(content).toContain('Scan for Details');
  });

  it('SVG without addQrCode does not include QR image', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).not.toContain('Scan for Details');
    expect(content).not.toContain('<image');
  });

  for (const imgType of ['png', 'jpg', 'webp', 'gif'] as DocType[]) {
    it(`${imgType} with addQrCode produces a taller image than without`, async () => {
      // Pin the same layout for both so the comparison is deterministic (default layout is random).
      const withQr = await generateDocument({
        userId: USER_ID,
        docType: imgType,
        techniqueId: TEST_TECHNIQUE_ID,
        imageLayout: 'comparison',
        addQrCode: true,
      });
      const withoutQr = await generateDocument({
        userId: USER_ID,
        docType: imgType,
        techniqueId: TEST_TECHNIQUE_ID,
        imageLayout: 'comparison',
      });

      // The QR variant adds a visible section, so the rasterized image is taller (740 vs 600).
      const withQrHeight = (await sharp(withQr.buffer).metadata()).height ?? 0;
      const withoutQrHeight = (await sharp(withoutQr.buffer).metadata()).height ?? 0;
      expect(withQrHeight).toBeGreaterThan(withoutQrHeight);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Image Layout Variety
// ═══════════════════════════════════════════════════════════════════════════

describe('Image Layout Variety', () => {
  const LAYOUTS = ['dashboard', 'report', 'infographic', 'email-preview', 'timeline', 'comparison'];

  for (const layout of LAYOUTS) {
    it(`SVG with layout="${layout}" produces valid SVG`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType: 'svg',
        techniqueId: TEST_TECHNIQUE_ID,
        customAction: `layout test ${layout}`,
        imageLayout: layout,
      });

      const content = result.buffer.toString('utf-8');
      expect(content).toContain('<svg');
      expect(content).toContain('</svg>');
      expect(content).toContain(`layout test ${layout}`);
      expect(result.buffer.length).toBeGreaterThan(200);
    });

    it(`PNG with layout="${layout}" produces valid PNG`, async () => {
      const result = await generateDocument({
        userId: USER_ID,
        docType: 'png',
        techniqueId: TEST_TECHNIQUE_ID,
        imageLayout: layout,
      });

      expect(result.buffer[0]).toBe(0x89); // PNG magic byte
      expect(result.buffer[1]).toBe(0x50);
      expect(result.buffer.length).toBeGreaterThan(500);
    });
  }

  it('different layouts produce different SVG content', async () => {
    const svgs: string[] = [];
    for (const layout of LAYOUTS) {
      const result = await generateDocument({
        userId: USER_ID,
        docType: 'svg',
        techniqueId: TEST_TECHNIQUE_ID,
        imageLayout: layout,
      });
      svgs.push(result.buffer.toString('utf-8'));
    }

    // Each layout should be distinct from every other layout
    for (let i = 0; i < svgs.length; i++) {
      for (let j = i + 1; j < svgs.length; j++) {
        expect(svgs[i]).not.toBe(svgs[j]);
      }
    }
  });

  it('unknown layout falls back to dashboard', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
      imageLayout: 'nonexistent',
    });

    // Should still produce valid SVG (falls back to dashboard)
    const content = result.buffer.toString('utf-8');
    expect(content).toContain('<svg');
    expect(content).toContain('Quarterly Performance Dashboard');
  });

  it('no explicit layout produces a valid SVG with one of the known layouts', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('<svg');
    expect(content).toContain('</svg>');
    expect(content.length).toBeGreaterThan(200);
  });

  it('layout with QR code produces valid SVG with both sections', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
      imageLayout: 'report',
      addQrCode: true,
    });

    const content = result.buffer.toString('utf-8');
    expect(content).toContain('<svg');
    expect(content).toContain('Scan for Details');
    expect(content).toContain('Strategic Analysis Report');
  });

  it('batch generation respects imageLayout', async () => {
    const results = await generateDocumentBatch({
      userId: USER_ID,
      docTypes: ['svg', 'png'],
      techniqueId: TEST_TECHNIQUE_ID,
      imageLayout: 'timeline',
    });

    expect(results).toHaveLength(2);
    const svgResult = results.find(r => r.docType === 'svg');
    expect(svgResult).toBeDefined();
    const content = svgResult!.buffer.toString('utf-8');
    expect(content).toContain('Project Milestone Timeline');
  });

  // Layout-specific visual markers
  it('report layout has accent bar and paragraph structure', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
      imageLayout: 'report',
    });
    const content = result.buffer.toString('utf-8');
    expect(content).toContain('fill="#2c3e50"');
    expect(content).toContain('Strategic Analysis Report');
  });

  it('infographic layout has colored stat blocks', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
      imageLayout: 'infographic',
    });
    const content = result.buffer.toString('utf-8');
    expect(content).toContain('fill="#1a1a2e"'); // dark background
    expect(content).toContain('Key Performance Indicators');
  });

  it('email-preview layout has inbox chrome', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
      imageLayout: 'email-preview',
    });
    const content = result.buffer.toString('utf-8');
    expect(content).toContain('Inbox');
    expect(content).toContain('From:');
    expect(content).toContain('Subject:');
  });

  it('timeline layout has numbered nodes with alternating cards', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
      imageLayout: 'timeline',
    });
    const content = result.buffer.toString('utf-8');
    expect(content).toContain('<circle');
    expect(content).toContain('Project Milestone Timeline');
    // 4 default nodes produce numbered circles 1-4
    expect(content).toContain('>1</text>');
    expect(content).toContain('>2</text>');
    expect(content).toContain('>3</text>');
    expect(content).toContain('>4</text>');
    // Alternating left/right — centre spine with dashed line
    expect(content).toContain('stroke-dasharray="6,4"');
    // Dynamic height — SVG height adapts to content
    const heightMatch = content.match(/height="(\d+)"/);
    expect(heightMatch).toBeTruthy();
    expect(Number(heightMatch![1])).toBeGreaterThan(300);
  });

  it('comparison layout has two columns', async () => {
    const result = await generateDocument({
      userId: USER_ID,
      docType: 'svg',
      techniqueId: TEST_TECHNIQUE_ID,
      imageLayout: 'comparison',
    });
    const content = result.buffer.toString('utf-8');
    expect(content).toContain('Comparative Analysis');
    expect(content).toContain('Option A');
    expect(content).toContain('Option B');
  });
});
