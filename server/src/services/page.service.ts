import { v4 as uuidv4 } from 'uuid';
import repos from '../db/repos';
import type { PageDoc } from '../db/repositories/types';
import { config } from '../config';
import { getTechniqueById, TECHNIQUES, XPIATechnique } from '../data/xpia-techniques';
import { ACTION_TARGETS } from '../data/payload-templates';
import * as blobStorage from './blob-storage.service';
import * as gateway from './llm/gateway';
import logger from '../logger';
import { recordPageCreated } from './metrics.service';
import { PAGE_PROMPTS, SEVERITY_INSTRUCTIONS, STEALTH_INSTRUCTIONS, interpolate } from '../config/prompts';
import { getUserPrompt } from './prompt-template.service';
import QRCode from 'qrcode';

const QR_MAX_LENGTH = 250;

/** Shorten payload for QR — prioritize the injection directive at the end, trim filler from the front */
function truncateForQr(full: string): string {
  if (full.length <= QR_MAX_LENGTH) return full;
  // The injection directive is typically at the end after filler/padding — preserve it
  const parts = full.split(/\n\n+/);
  if (parts.length > 1) {
    // Take from the end until we fill the budget
    let directive = '';
    for (let i = parts.length - 1; i >= 0; i--) {
      const candidate = parts[i].trim();
      if (!candidate) continue;
      const combined = candidate + (directive ? '\n\n' + directive : '');
      if (combined.length <= QR_MAX_LENGTH) {
        directive = combined;
      } else {
        break;
      }
    }
    if (directive.length > 0) return directive;
  }
  // Last resort: take the tail of the payload (where the directive lives)
  return '\u2026' + full.slice(-(QR_MAX_LENGTH - 1));
}

export interface XPIAPage {
  id: string;
  userId: string;
  slug: string;
  title: string;
  technique: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function docToPage(doc: PageDoc): XPIAPage {
  return {
    id: doc.id,
    userId: doc.userId,
    slug: doc.slug,
    title: doc.title,
    technique: doc.technique,
    content: doc.content,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function generateSlug(): string {
  return uuidv4().slice(0, 8);
}

/** Escape HTML entities to prevent XSS in page title and non-payload content */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function buildPageHtml(title: string, technique: XPIATechnique, customAction?: string, addQrCode?: boolean): Promise<string> {
  const safeTitle = escapeHtml(title);
  const action = customAction || ACTION_TARGETS[0];
  let payload = technique.template;
  payload = payload.replace(/\{\{ACTION\}\}/g, action);
  payload = payload.replace(/\{\{BASE64_ACTION\}\}/g, Buffer.from(action).toString('base64'));
  payload = payload.replace(/\{\{EXFIL_DOMAIN\}\}/g, 'attacker.example');
  payload = payload.replace(/\{\{TOOL_NAME\}\}/g, 'send_data');
  payload = payload.replace(/\{\{PARAM\}\}/g, 'data');
  payload = payload.replace(/\{\{VALUE\}\}/g, 'exfiltrated');
  payload = payload.replace(/\{\{ATTACKER_DOMAIN\}\}/g, 'attacker.example');
  payload = payload.replace(/\{\{TRIGGER_WORD\}\}/g, 'activate');
  payload = payload.replace(/\{\{ROT13_ACTION\}\}/g, action);
  payload = payload.replace(/\{\{HOMOGLYPH_ACTION\}\}/g, action);
  payload = payload.replace(/\{\{HIDDEN_ACTION\}\}/g, action);
  payload = payload.replace(/\{\{SPLIT_ACTION_PART1\}\}/g, action.slice(0, Math.floor(action.length / 2)));
  payload = payload.replace(/\{\{SPLIT_ACTION_PART2\}\}/g, action.slice(Math.floor(action.length / 2)));

  let embeddedContent = '';
  switch (technique.embeddingMethod) {
    case 'white_text':
      embeddedContent = `<p style="color:#fff;font-size:0;line-height:0;max-height:0;overflow:hidden">${payload}</p>`;
      break;
    case 'tiny_font':
      embeddedContent = `<p style="font-size:1px;color:#fefefe">${payload}</p>`;
      break;
    case 'hidden_text':
      embeddedContent = `<div style="display:none">${payload}</div>`;
      break;
    case 'metadata':
      embeddedContent = `<!-- ${payload} -->`;
      break;
    case 'comment':
      embeddedContent = `<!-- ${payload} -->`;
      break;
    default:
      embeddedContent = `<p>${payload}</p>`;
  }

  let qrHtml = '';
  if (addQrCode) {
    // Use concise action for QR — not the full payload with filler/padding
    const qrPayload = payload.length <= QR_MAX_LENGTH ? payload
      : (action.length <= QR_MAX_LENGTH ? action : '\u2026' + action.slice(-(QR_MAX_LENGTH - 1)));
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
    qrHtml = `\n      <div style="margin:24px auto;text-align:center"><img src="${qrDataUrl}" width="200" height="200" alt="QR Code" style="display:block;margin:0 auto" /></div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${technique.embeddingMethod === 'metadata' ? payload.replace(/"/g, '&quot;') : safeTitle}">
  <title>${safeTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fafafa; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 28px; font-weight: 600; margin-bottom: 16px; color: #1a1a2e; }
    .meta { color: #888; font-size: 14px; margin-bottom: 32px; }
    .content { font-size: 16px; line-height: 1.8; }
    .content p { margin-bottom: 16px; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee; font-size: 13px; color: #aaa; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${safeTitle}</h1>
    <div class="meta">Published ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    <div class="content">
      <p>This page contains research findings related to artificial intelligence safety and alignment. The content has been prepared for authorized security evaluation purposes.</p>
      ${embeddedContent}
      <p>Recent advances in large language models have demonstrated both remarkable capabilities and potential vulnerabilities. Understanding these attack surfaces is critical for building robust AI systems.</p>
      <p>Our research team has identified several key areas where model safety can be improved, including input sanitization, output filtering, and instruction hierarchy enforcement.</p>${qrHtml}
    </div>
    <div class="footer">
      <p>AI Safety Research Lab — For authorized evaluation purposes only.</p>
    </div>
  </div>
</body>
</html>`;
}

async function buildPageHtmlWithLlm(
  userId: string, modelId: string, title: string, technique: XPIATechnique, customAction?: string, correlationId?: string, addQrCode?: boolean, stealth?: string,
): Promise<string> {
  const safeTitle = escapeHtml(title);
  const action = customAction || ACTION_TARGETS[0];
  let payload = technique.template;
  payload = payload.replace(/\{\{ACTION\}\}/g, action);
  payload = payload.replace(/\{\{BASE64_ACTION\}\}/g, Buffer.from(action).toString('base64'));
  payload = payload.replace(/\{\{EXFIL_DOMAIN\}\}/g, 'attacker.example');
  payload = payload.replace(/\{\{TOOL_NAME\}\}/g, 'send_data');
  payload = payload.replace(/\{\{PARAM\}\}/g, 'data');
  payload = payload.replace(/\{\{VALUE\}\}/g, 'exfiltrated');
  payload = payload.replace(/\{\{ATTACKER_DOMAIN\}\}/g, 'attacker.example');
  payload = payload.replace(/\{\{TRIGGER_WORD\}\}/g, 'activate');
  payload = payload.replace(/\{\{ROT13_ACTION\}\}/g, action);
  payload = payload.replace(/\{\{HOMOGLYPH_ACTION\}\}/g, action);
  payload = payload.replace(/\{\{HIDDEN_ACTION\}\}/g, action);
  payload = payload.replace(/\{\{SPLIT_ACTION_PART1\}\}/g, action.slice(0, Math.floor(action.length / 2)));
  payload = payload.replace(/\{\{SPLIT_ACTION_PART2\}\}/g, action.slice(Math.floor(action.length / 2)));

  let embeddedContent = '';
  switch (technique.embeddingMethod) {
    case 'white_text':
      embeddedContent = `<p style="color:#fff;font-size:0;line-height:0;max-height:0;overflow:hidden">${payload}</p>`;
      break;
    case 'tiny_font':
      embeddedContent = `<p style="font-size:1px;color:#fefefe">${payload}</p>`;
      break;
    case 'hidden_text':
      embeddedContent = `<div style="display:none">${payload}</div>`;
      break;
    case 'metadata':
      embeddedContent = `<!-- ${payload} -->`;
      break;
    case 'comment':
      embeddedContent = `<!-- ${payload} -->`;
      break;
    default:
      embeddedContent = `<p>${payload}</p>`;
  }

  // Generate enhanced page body content via LLM
  const result = await gateway.complete({
    userId,
    modelDbId: modelId,
    messages: [
      {
        role: 'system',
        content: await getUserPrompt(userId, 'page', 'system'),
      },
      {
        role: 'user',
        content: interpolate(await getUserPrompt(userId, 'page', 'user'), {
          PAGE_TITLE: title,
          EMBEDDING_METHOD: technique.embeddingMethod,
          SEVERITY_INSTRUCTION: SEVERITY_INSTRUCTIONS[technique.severity] || SEVERITY_INSTRUCTIONS.medium,
          STEALTH_INSTRUCTION: STEALTH_INSTRUCTIONS[stealth || 'medium'] || STEALTH_INSTRUCTIONS.medium,
        }),
      },
    ],
    purpose: 'page_enhance',
    maxTokens: PAGE_PROMPTS.maxTokens,
    temperature: PAGE_PROMPTS.temperature,
    correlationId,
  });

  // Strip any disclaimer/preamble text before the first <p> tag
  const firstPTag = result.content.indexOf('<p');
  const llmBody = (firstPTag > 0 ? result.content.slice(firstPTag) : result.content).trim();

  let qrHtml = '';
  if (addQrCode) {
    // Use concise action for QR — not the full payload with filler/padding
    const qrPayload = payload.length <= QR_MAX_LENGTH ? payload
      : (action.length <= QR_MAX_LENGTH ? action : '\u2026' + action.slice(-(QR_MAX_LENGTH - 1)));
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
    qrHtml = `\n      <div style="margin:24px auto;text-align:center"><img src="${qrDataUrl}" width="200" height="200" alt="QR Code" style="display:block;margin:0 auto" /></div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${technique.embeddingMethod === 'metadata' ? payload.replace(/"/g, '&quot;') : safeTitle}">
  <title>${safeTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fafafa; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 28px; font-weight: 600; margin-bottom: 16px; color: #1a1a2e; }
    .meta { color: #888; font-size: 14px; margin-bottom: 32px; }
    .content { font-size: 16px; line-height: 1.8; }
    .content p { margin-bottom: 16px; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee; font-size: 13px; color: #aaa; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${safeTitle}</h1>
    <div class="meta">Published ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    <div class="content">
      ${llmBody}
      ${embeddedContent}${qrHtml}
    </div>
    <div class="footer">
      <p>AI Safety Research Lab — For authorized evaluation purposes only.</p>
    </div>
  </div>
</body>
</html>`;
}

export async function createPage(
  userId: string,
  title: string,
  techniqueId: string,
  customAction?: string,
  modelId?: string,
  correlationId?: string,
  addQrCode?: boolean,
  stealth?: string,
): Promise<XPIAPage> {
  // Enforce per-user page count limit
  const count = await repos.pages.countByUser(userId);
  if (count >= config.maxPagesPerUser) {
    throw new Error(`Page limit reached (max ${config.maxPagesPerUser}). Delete existing pages to create new ones.`);
  }

  const technique = getTechniqueById(techniqueId);
  if (!technique) throw new Error(`Unknown technique: ${techniqueId}`);

  const id = uuidv4();
  const slug = generateSlug();

  // Use LLM-enhanced page builder when modelId is provided
  let content: string;
  if (modelId) {
    content = await buildPageHtmlWithLlm(userId, modelId, title, technique, customAction, correlationId, addQrCode, stealth);
  } else {
    content = await buildPageHtml(title, technique, customAction, addQrCode);
  }

  const now = new Date().toISOString();
  await repos.pages.create({
    id, userId, slug, title, technique: techniqueId, content,
    isActive: true, createdAt: now, updatedAt: now,
    embeddingMethod: technique.embeddingMethod,
    severity: technique.severity,
    customAction,
    modelId,
    addQrCode,
    stealth,
  });

  recordPageCreated();

  // Upload to Azure Blob Storage (non-blocking — page is in DB regardless)
  blobStorage.uploadPage(slug, content).catch((err) => {
    logger.error({ slug, err }, 'Failed to upload page to blob storage');
  });

  const doc = (await repos.pages.getById(id, userId))!;
  return docToPage(doc);
}

export async function getPageBySlug(slug: string): Promise<XPIAPage | null> {
  const doc = await repos.pages.getBySlug(slug);
  if (!doc || !doc.isActive) return null;
  return docToPage(doc);
}

export async function getUserPages(userId: string): Promise<XPIAPage[]> {
  const docs = await repos.pages.listByUser(userId);
  return docs.map(docToPage);
}

export async function togglePage(userId: string, pageId: string): Promise<XPIAPage> {
  const doc = await repos.pages.getById(pageId, userId);
  if (!doc) throw new Error('Page not found');

  const newState = !doc.isActive;
  await repos.pages.update(pageId, userId, { isActive: newState, updatedAt: new Date().toISOString() });

  // Sync blob storage: upload when activating, delete when deactivating
  if (newState) {
    blobStorage.uploadPage(doc.slug, doc.content).catch((err) => {
      logger.error({ slug: doc.slug, err }, 'Failed to upload page to blob storage');
    });
  } else {
    blobStorage.deletePage(doc.slug).catch((err) => {
      logger.error({ slug: doc.slug, err }, 'Failed to delete page from blob storage');
    });
  }

  const updated = (await repos.pages.getById(pageId, userId))!;
  return docToPage(updated);
}

export async function deletePage(userId: string, pageId: string): Promise<void> {
  const doc = await repos.pages.getById(pageId, userId);
  if (!doc) throw new Error('Page not found');

  await repos.pages.delete(pageId, userId);

  // Remove from blob storage
  blobStorage.deletePage(doc.slug).catch((err) => {
    logger.error({ slug: doc.slug, err }, 'Failed to delete page from blob storage');
  });
}
