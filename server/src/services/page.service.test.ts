import { describe, it, expect, vi, beforeEach } from 'vitest';
import repos from '../db/repos';

// Mock blob storage
vi.mock('./blob-storage.service', () => ({
  uploadPage: vi.fn(() => Promise.resolve()),
  deletePage: vi.fn(() => Promise.resolve()),
  isConfigured: vi.fn(() => false),
}));

// Mock prompt-template service to return code defaults
vi.mock('./prompt-template.service', () => ({
  getUserPrompt: vi.fn((_userId: string, _category: string, type: string) =>
    type === 'system'
      ? 'You write realistic, professional web page content for AI security research.'
      : 'Write the body content for a public web page titled "{{PAGE_TITLE}}".'
  ),
}));

// Mock LLM gateway
vi.mock('./llm/gateway', () => ({
  complete: vi.fn(),
}));

import { createPage, getPageBySlug, togglePage, deletePage, getUserPages } from './page.service';
import * as blobStorage from './blob-storage.service';
import * as gateway from './llm/gateway';

const TEST_TECHNIQUE_ID = 'di-ignore-previous';
const USER_ID = 'test-user-123';

describe('Page Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (repos.pages as any).reset();
  });

  describe('createPage', () => {
    it('creates a page with valid inputs', async () => {
      const page = await createPage(USER_ID, 'Test Page', TEST_TECHNIQUE_ID);
      expect(page.title).toBe('Test Page');
      expect(page.isActive).toBe(true);
      expect(page.userId).toBe(USER_ID);
      expect(page.slug).toHaveLength(8);
    });

    it('throws on unknown technique', async () => {
      await expect(createPage(USER_ID, 'Test', 'nonexistent-technique')).rejects.toThrow('Unknown technique');
    });

    it('enforces per-user page count limit', async () => {
      // Create pages up to limit (default 50)
      for (let i = 0; i < 50; i++) {
        await repos.pages.create({
          id: `page-${i}`, userId: USER_ID, slug: `slug${i}`, title: `P${i}`,
          technique: TEST_TECHNIQUE_ID, content: '<html></html>',
          isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01',
        });
      }
      await expect(createPage(USER_ID, 'Test', TEST_TECHNIQUE_ID)).rejects.toThrow('Page limit reached');
    });

    it('calls blob storage upload on creation', async () => {
      await createPage(USER_ID, 'Test', TEST_TECHNIQUE_ID);
      expect(blobStorage.uploadPage).toHaveBeenCalled();
    });
  });

  describe('HTML generation security', () => {
    it('escapes HTML entities in page title', async () => {
      const page = await createPage(USER_ID, '<script>alert("xss")</script>', TEST_TECHNIQUE_ID);
      expect(page.content).not.toContain('<script>alert');
    });

    it('escapes quotes in page title', async () => {
      const page = await createPage(USER_ID, 'Test "quoted" & <tagged>', TEST_TECHNIQUE_ID);
      expect(page.content).toContain('&lt;tagged&gt;');
      expect(page.content).toContain('&quot;quoted&quot;');
    });

    it('generates valid HTML structure', async () => {
      const page = await createPage(USER_ID, 'Safe Title', TEST_TECHNIQUE_ID);
      expect(page.content).toContain('<!DOCTYPE html>');
      expect(page.content).toContain('<title>Safe Title</title>');
      expect(page.content).toContain('<h1>Safe Title</h1>');
      expect(page.content).toContain('</html>');
    });
  });

  describe('getPageBySlug', () => {
    it('returns null for non-existent slug', async () => {
      expect(await getPageBySlug('abcd1234')).toBeNull();
    });

    it('returns page when found', async () => {
      const created = await createPage(USER_ID, 'Test', TEST_TECHNIQUE_ID);
      const page = await getPageBySlug(created.slug);
      expect(page).not.toBeNull();
      expect(page!.slug).toBe(created.slug);
    });
  });

  describe('togglePage', () => {
    it('throws when page not found', async () => {
      await expect(togglePage(USER_ID, 'nonexistent')).rejects.toThrow('Page not found');
    });

    it('deactivates an active page and calls blob delete', async () => {
      const created = await createPage(USER_ID, 'Test', TEST_TECHNIQUE_ID);
      vi.clearAllMocks(); // clear createPage's blob calls

      const page = await togglePage(USER_ID, created.id);
      expect(page.isActive).toBe(false);
      expect(blobStorage.deletePage).toHaveBeenCalledWith(created.slug);
    });

    it('activates an inactive page and calls blob upload', async () => {
      const created = await createPage(USER_ID, 'Test', TEST_TECHNIQUE_ID);
      await togglePage(USER_ID, created.id); // deactivate
      vi.clearAllMocks();

      const page = await togglePage(USER_ID, created.id); // reactivate
      expect(page.isActive).toBe(true);
      expect(blobStorage.uploadPage).toHaveBeenCalledWith(created.slug, expect.any(String));
    });
  });

  describe('deletePage', () => {
    it('throws when page not found', async () => {
      await expect(deletePage(USER_ID, 'nonexistent')).rejects.toThrow('Page not found');
    });

    it('deletes page and calls blob delete', async () => {
      const created = await createPage(USER_ID, 'Test', TEST_TECHNIQUE_ID);
      vi.clearAllMocks();

      await deletePage(USER_ID, created.id);
      expect(blobStorage.deletePage).toHaveBeenCalledWith(created.slug);
      expect(await getUserPages(USER_ID)).toHaveLength(0);
    });
  });

  describe('getUserPages', () => {
    it('returns empty array when no pages', async () => {
      expect(await getUserPages(USER_ID)).toEqual([]);
    });

    it('returns mapped pages', async () => {
      await createPage(USER_ID, 'Test', TEST_TECHNIQUE_ID);
      const pages = await getUserPages(USER_ID);
      expect(pages).toHaveLength(1);
      expect(pages[0].title).toBe('Test');
    });
  });

  describe('createPage - LLM Enhancement', () => {
    const mockComplete = vi.mocked(gateway.complete);

    it('calls gateway.complete when modelId is provided', async () => {
      mockComplete.mockResolvedValueOnce({
        content: '<p>LLM generated paragraph about security.</p><p>More analysis.</p>',
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
        model: 'gpt-5',
        finishReason: 'stop',
      } as any);

      const page = await createPage(USER_ID, 'AI Security Research', TEST_TECHNIQUE_ID, undefined, 'model-123');
      expect(page).toBeDefined();
      expect(mockComplete).toHaveBeenCalledOnce();
      expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
        userId: USER_ID,
        modelDbId: 'model-123',
        purpose: 'page_enhance',
      }));
    });

    it('does not call gateway when no modelId', async () => {
      await createPage(USER_ID, 'Static Page', TEST_TECHNIQUE_ID);
      expect(mockComplete).not.toHaveBeenCalled();
    });

    it('throws when gateway rejects during LLM page build', async () => {
      mockComplete.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      await expect(
        createPage(USER_ID, 'Fallback Page', TEST_TECHNIQUE_ID, undefined, 'model-bad')
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('embeds QR code data URL when addQrCode is true', async () => {
      const page = await createPage(USER_ID, 'QR Page', TEST_TECHNIQUE_ID, undefined, undefined, undefined, true);
      expect(page.content).toContain('data:image/png;base64,');
      expect(page.content).toContain('QR Code');
    });

    it('does not include QR code when addQrCode is false or undefined', async () => {
      const page = await createPage(USER_ID, 'No QR Page', TEST_TECHNIQUE_ID);
      expect(page.content).not.toContain('data:image/png;base64,');
    });
  });
});
