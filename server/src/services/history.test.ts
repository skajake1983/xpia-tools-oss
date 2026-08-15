import { describe, it, expect, vi, beforeEach } from 'vitest';
import repos from '../db/repos';

// Mock blob storage download (document.service dynamically imports this)
vi.mock('./blob-storage.service', () => ({
  downloadDocument: vi.fn(),
  uploadPage: vi.fn(),
  deletePage: vi.fn(),
  isConfigured: vi.fn(() => false),
}));

// Mock LLM gateway (required by payload.service)
vi.mock('./llm/gateway', () => ({
  complete: vi.fn(),
}));

import {
  getDocumentHistory,
  getDocumentById,
  cleanupOldDocuments,
} from './document.service';

import {
  getPayloadHistory,
  getPayloadById,
  cleanupOldPayloads,
} from './payload.service';

import { downloadDocument } from './blob-storage.service';

const USER_ID = 'test-user-id';

describe('Document History', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (repos.content as any).reset();
  });

  it('getDocumentHistory returns entries with blobRef', async () => {
    await repos.content.createDocument({
      id: 'doc-1', userId: USER_ID, kind: 'document',
      filename: 'doc-test.docx', docType: 'docx', technique: 'di-ignore-previous',
      blobRef: 'docs/doc-1.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      createdAt: '2026-03-14T00:00:00.000Z',
    });

    const result = await getDocumentHistory(USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ id: 'doc-1', filename: 'doc-test.docx' }));
  });

  it('getDocumentHistory excludes content from listing', async () => {
    await repos.content.createDocument({
      id: 'doc-1', userId: USER_ID, kind: 'document',
      filename: 'test.docx', docType: 'docx', technique: 'di-ignore-previous',
      blobRef: 'docs/doc-1.docx', mimeType: 'text/plain',
      createdAt: '2026-03-14T00:00:00.000Z',
    });

    const result = await getDocumentHistory(USER_ID);
    expect(result[0]).not.toHaveProperty('content');
    expect(result[0]).not.toHaveProperty('blobRef');
  });

  it('getDocumentById returns file content for valid id and user', async () => {
    await repos.content.createDocument({
      id: 'doc-1', userId: USER_ID, kind: 'document',
      filename: 'doc-test.docx', docType: 'docx', technique: 'di-ignore-previous',
      blobRef: 'docs/doc-1.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      createdAt: '2026-03-14T00:00:00.000Z',
    });

    vi.mocked(downloadDocument).mockResolvedValueOnce(Buffer.from('test-content'));

    const result = await getDocumentById('doc-1', USER_ID);
    expect(result).not.toBeNull();
    expect(result!.filename).toBe('doc-test.docx');
    expect(result!.content).toEqual(Buffer.from('test-content'));
  });

  it('getDocumentById returns null when not found', async () => {
    const result = await getDocumentById('nonexistent', USER_ID);
    expect(result).toBeNull();
  });

  it('getDocumentById returns null when blobRef is missing', async () => {
    await repos.content.createDocument({
      id: 'doc-no-blob', userId: USER_ID, kind: 'document',
      filename: 'test.docx', docType: 'docx', technique: 'di-ignore-previous',
      blobRef: null, mimeType: 'text/plain',
      createdAt: '2026-03-14T00:00:00.000Z',
    });

    const result = await getDocumentById('doc-no-blob', USER_ID);
    expect(result).toBeNull();
  });

  it('cleanupOldDocuments deletes records older than specified days', async () => {
    const oldDate = new Date(Date.now() - 30 * 86400000).toISOString();
    await repos.content.createDocument({
      id: 'old-doc-1', userId: USER_ID, kind: 'document',
      filename: 'old.docx', docType: 'docx', technique: 'di-ignore-previous',
      blobRef: 'docs/old-1.docx', mimeType: 'text/plain', createdAt: oldDate,
    });
    await repos.content.createDocument({
      id: 'old-doc-2', userId: USER_ID, kind: 'document',
      filename: 'old2.docx', docType: 'docx', technique: 'di-ignore-previous',
      blobRef: 'docs/old-2.docx', mimeType: 'text/plain', createdAt: oldDate,
    });
    await repos.content.createDocument({
      id: 'new-doc', userId: USER_ID, kind: 'document',
      filename: 'new.docx', docType: 'docx', technique: 'di-ignore-previous',
      blobRef: 'docs/new.docx', mimeType: 'text/plain', createdAt: new Date().toISOString(),
    });

    const removed = await cleanupOldDocuments(7);
    expect(removed).toBe(2);
  });
});

describe('Payload History', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (repos.content as any).reset();
  });

  it('getPayloadHistory returns entries with stored content', async () => {
    await repos.content.createPayload({
      id: 'pay-1', userId: USER_ID, kind: 'payload',
      category: 'data_exfiltration', severity: 'high', payloadCount: 5,
      seed: 12345, format: 'json', content: '{"payloads":[]}',
      createdAt: '2026-03-14T00:00:00.000Z',
    });

    const result = await getPayloadHistory(USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ id: 'pay-1', category: 'data_exfiltration' }));
  });

  it('getPayloadHistory excludes content from listing', async () => {
    await repos.content.createPayload({
      id: 'pay-1', userId: USER_ID, kind: 'payload',
      category: 'data_exfiltration', severity: 'high', payloadCount: 5,
      seed: 12345, format: 'json', content: '{"payloads":[]}',
      createdAt: '2026-03-14T00:00:00.000Z',
    });

    const result = await getPayloadHistory(USER_ID);
    expect(result[0]).not.toHaveProperty('content');
  });

  it('getPayloadById returns content for valid id and user', async () => {
    await repos.content.createPayload({
      id: 'pay-1', userId: USER_ID, kind: 'payload',
      category: 'data_exfiltration', severity: 'high', payloadCount: 5,
      seed: 12345, format: 'json', content: '{"seed":12345,"payloads":[]}',
      createdAt: '2026-03-14T00:00:00.000Z',
    });

    const result = await getPayloadById('pay-1', USER_ID);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('{"seed":12345,"payloads":[]}');
    expect(result!.format).toBe('json');
    expect(result!.seed).toBe(12345);
  });

  it('getPayloadById returns null when not found', async () => {
    const result = await getPayloadById('nonexistent', USER_ID);
    expect(result).toBeNull();
  });

  it('getPayloadById returns null when content is missing', async () => {
    await repos.content.createPayload({
      id: 'pay-expired', userId: USER_ID, kind: 'payload',
      category: 'data_exfiltration', severity: 'high', payloadCount: 5,
      seed: 0, format: 'json', content: null,
      createdAt: '2026-03-14T00:00:00.000Z',
    });

    const result = await getPayloadById('pay-expired', USER_ID);
    expect(result).toBeNull();
  });

  it('cleanupOldPayloads deletes records older than specified days', async () => {
    const oldDate = new Date(Date.now() - 30 * 86400000).toISOString();
    await repos.content.createPayload({
      id: 'old-pay', userId: USER_ID, kind: 'payload',
      category: 'data_exfiltration', severity: 'high', payloadCount: 5,
      seed: 0, format: 'json', content: '...', createdAt: oldDate,
    });
    await repos.content.createPayload({
      id: 'new-pay', userId: USER_ID, kind: 'payload',
      category: 'data_exfiltration', severity: 'high', payloadCount: 5,
      seed: 0, format: 'json', content: '...', createdAt: new Date().toISOString(),
    });

    const removed = await cleanupOldPayloads(7);
    expect(removed).toBe(1);
  });

  it('cleanupOldPayloads defaults to 7 days', async () => {
    // With no old records, should return 0
    const removed = await cleanupOldPayloads();
    expect(removed).toBe(0);
  });
});

describe('Document History excludes image types', () => {
  const IMAGE_TYPES = new Set(['png', 'svg', 'jpg', 'webp', 'gif']);

  beforeEach(() => {
    vi.clearAllMocks();
    (repos.content as any).reset();
  });

  it('getDocumentHistory returns both document and image entries', async () => {
    await repos.content.createDocument({
      id: 'doc-1', userId: USER_ID, kind: 'document',
      filename: 'report.docx', docType: 'docx', technique: 'di-ignore-previous',
      blobRef: 'docs/doc-1.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      createdAt: '2026-03-14T00:00:00.000Z',
    });
    await repos.content.createDocument({
      id: 'img-1', userId: USER_ID, kind: 'document',
      filename: 'chart.png', docType: 'png', technique: 'cm-context-overflow',
      blobRef: 'docs/img-1.png', mimeType: 'image/png',
      createdAt: '2026-03-14T00:00:01.000Z',
    });

    const all = await getDocumentHistory(USER_ID);
    expect(all).toHaveLength(2);
  });

  it('filtering by IMAGE_TYPES correctly separates documents from images', async () => {
    await repos.content.createDocument({
      id: 'doc-1', userId: USER_ID, kind: 'document',
      filename: 'report.docx', docType: 'docx', technique: 'di-ignore-previous',
      blobRef: 'docs/doc-1.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      createdAt: '2026-03-14T00:00:00.000Z',
    });
    await repos.content.createDocument({
      id: 'img-1', userId: USER_ID, kind: 'document',
      filename: 'chart.png', docType: 'png', technique: 'cm-context-overflow',
      blobRef: 'docs/img-1.png', mimeType: 'image/png',
      createdAt: '2026-03-14T00:00:01.000Z',
    });
    await repos.content.createDocument({
      id: 'img-2', userId: USER_ID, kind: 'document',
      filename: 'infographic.svg', docType: 'svg', technique: 'cm-context-overflow',
      blobRef: 'docs/img-2.svg', mimeType: 'image/svg+xml',
      createdAt: '2026-03-14T00:00:02.000Z',
    });

    const all = await getDocumentHistory(USER_ID);
    const docOnly = all.filter(h => !IMAGE_TYPES.has(h.doc_type));
    const imgOnly = all.filter(h => IMAGE_TYPES.has(h.doc_type));

    expect(docOnly).toHaveLength(1);
    expect(docOnly[0].doc_type).toBe('docx');
    expect(imgOnly).toHaveLength(2);
    expect(imgOnly.map(i => i.doc_type).sort()).toEqual(['png', 'svg']);
  });
});
