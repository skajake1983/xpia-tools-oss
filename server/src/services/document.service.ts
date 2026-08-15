import { v4 as uuidv4 } from 'uuid';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer, SectionType, CommentRangeStart, CommentRangeEnd, CommentReference } from 'docx';
import PptxGenJS from 'pptxgenjs';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { TECHNIQUES, getTechniqueById, XPIATechnique } from '../data/xpia-techniques';
import { ACTION_TARGETS } from '../data/payload-templates';
import repos from '../db/repos';
import * as gateway from './llm/gateway';
import logger from '../logger';
import { recordDocumentGenerated } from './metrics.service';
import { DOCUMENT_PROMPTS, SCHEMA_GROUPS, SEVERITY_INSTRUCTIONS, STEALTH_INSTRUCTIONS, interpolate, IMAGE_PROMPTS } from '../config/prompts';
import { getUserPrompt } from './prompt-template.service';

export type DocType = 'docx' | 'htm' | 'pptx' | 'xlsx' | 'pdf' | 'png' | 'svg' | 'jpg' | 'webp' | 'gif' | 'csv' | 'md' | 'ics' | 'vcf' | 'json' | 'yaml' | 'rtf' | 'qr';

/** Runtime list of all supported document types (mirrors DocType). */
export const DOC_TYPES: DocType[] = ['docx', 'htm', 'pptx', 'xlsx', 'pdf', 'png', 'svg', 'jpg', 'webp', 'gif', 'csv', 'md', 'ics', 'vcf', 'json', 'yaml', 'rtf', 'qr'];

export interface GenerateDocumentOptions {
  userId: string;
  docType: DocType;
  techniqueId: string;
  /** Custom action text, or uses a default action target */
  customAction?: string;
  /** LLM model DB id — when provided, LLM generates enhanced cover content */
  modelId?: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** When true, embed a QR code of the payload into rich document formats */
  addQrCode?: boolean;
  /** Stealth level for payload disguise wording (low | medium | high) */
  stealth?: string;
  /** Image layout override — when set, forces a specific layout instead of LLM auto-selection */
  imageLayout?: string;
}

interface GeneratedDoc {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

function resolveAction(technique: XPIATechnique, customAction?: string): string {
  const action = customAction || ACTION_TARGETS[0];
  let payload = technique.template;
  payload = payload.replace(/\{\{ACTION\}\}/g, action);
  payload = payload.replace(/\{\{BASE64_ACTION\}\}/g, Buffer.from(action).toString('base64'));
  payload = payload.replace(/\{\{ROT13_ACTION\}\}/g, action.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  }));
  payload = payload.replace(/\{\{HOMOGLYPH_ACTION\}\}/g, action);
  payload = payload.replace(/\{\{HIDDEN_ACTION\}\}/g, action);
  payload = payload.replace(/\{\{EXFIL_DOMAIN\}\}/g, 'attacker.example');
  payload = payload.replace(/\{\{TOOL_NAME\}\}/g, 'send_data');
  payload = payload.replace(/\{\{PARAM\}\}/g, 'data');
  payload = payload.replace(/\{\{VALUE\}\}/g, 'exfiltrated');
  payload = payload.replace(/\{\{ATTACKER_DOMAIN\}\}/g, 'attacker.example');
  payload = payload.replace(/\{\{TRIGGER_WORD\}\}/g, 'activate');
  payload = payload.replace(/\{\{SPLIT_ACTION_PART1\}\}/g, action.slice(0, Math.floor(action.length / 2)));
  payload = payload.replace(/\{\{SPLIT_ACTION_PART2\}\}/g, action.slice(Math.floor(action.length / 2)));
  return payload;
}

// === DOCX Generation ===

async function generateDocx(technique: XPIATechnique, action: string, content?: EnhancedContent, qrBuffer?: Buffer): Promise<Buffer> {
  const payload = content?.enhancedPayload || resolveAction(technique, action);
  const docTitle = content?.title ?? 'Quarterly Financial Report';
  const authorName = content?.author ?? 'Finance Department';
  const sections = content?.sections ?? [
    { heading: 'Executive Summary', body: 'This document contains the quarterly financial summary for Q4 2025. All figures have been reviewed and approved by the finance department.' },
    { heading: 'Financial Highlights', body: 'Revenue increased by 12% compared to the previous quarter, driven primarily by expansion in the enterprise segment.', bullets: ['Enterprise sales grew 18% year-over-year', 'Operating margins improved to 24.3%', 'Customer acquisition cost decreased by 9%'] },
    { heading: 'Outlook', body: 'Based on current pipeline and market conditions, we project continued growth into the next fiscal quarter with particular strength in recurring revenue streams.' },
  ];

  const children: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({ text: docTitle, bold: true, size: 32 }),
      ],
    }),
    new Paragraph({
      children: [new TextRun({ text: content?.subtitle ?? 'Q4 2025 Summary', size: 22, color: '666666', italics: true })],
    }),
    new Paragraph({ children: [new TextRun({ text: '' })] }),
  ];

  // Render all sections with headings and bullet points
  for (const section of sections) {
    if (section.heading) {
      children.push(new Paragraph({
        children: [new TextRun({ text: section.heading, bold: true, size: 26 })],
      }));
    }
    if (section.body) {
      children.push(new Paragraph({
        children: [new TextRun({ text: section.body, size: 24 })],
      }));
    }
    if (section.bullets) {
      for (const bullet of section.bullets) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `  •  ${bullet}`, size: 24 })],
        }));
      }
    }
    children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
  }

  // Embed using the technique's embedding method
  switch (technique.embeddingMethod) {
    case 'white_text':
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: payload, color: 'FFFFFF', size: 2 }),
          ],
        }),
      );
      break;
    case 'tiny_font':
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: payload, size: 1 }),
          ],
        }),
      );
      break;
    case 'hidden_text':
      // Embed as vanished text — truly hidden via <w:vanish/>
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: payload, vanish: true, size: 2 }),
          ],
        }),
      );
      break;
    case 'metadata':
      // Will add via document metadata below
      break;
    case 'comment':
      // Add as a Word comment
      const commentId = 0;
      children.push(
        new Paragraph({
          children: [
            new CommentRangeStart(commentId),
            new TextRun({ text: 'See attached notes for details.' }),
            new CommentRangeEnd(commentId),
            new CommentReference(commentId),
          ],
        }),
      );
      break;
    case 'visible_text':
    default:
      children.push(
        new Paragraph({
          children: [new TextRun({ text: payload, size: 24 })],
        }),
      );
      break;
  }

  children.push(
    new Paragraph({ children: [new TextRun({ text: '' })] }),
    new Paragraph({
      children: [
        new TextRun({
          text: content?.signOff ?? 'Confidential — For authorized personnel only.',
          size: 20,
          italics: true,
          color: '999999',
        }),
      ],
    }),
  );

  if (qrBuffer) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: '' })] }),
      new Paragraph({
        children: [
          new ImageRun({ data: qrBuffer, transformation: { width: 150, height: 150 }, type: 'png' }),
        ],
      }),
    );
  }

  const docProps: Record<string, unknown> = {
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: technique.embeddingMethod === 'hidden_text' ? payload : 'Confidential',
                    size: technique.embeddingMethod === 'hidden_text' ? 2 : 16,
                    ...(technique.embeddingMethod === 'hidden_text' ? { vanish: true } : { color: '999999' }),
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  };

  // Metadata injection
  if (technique.embeddingMethod === 'metadata') {
    Object.assign(docProps, {
      title: payload,
      subject: payload,
      creator: payload,
      description: payload,
    });
  } else {
    Object.assign(docProps, {
      title: docTitle,
      subject: content?.subtitle ?? 'Q4 2025 Summary',
      creator: authorName,
    });
  }

  const doc = new Document(docProps as ConstructorParameters<typeof Document>[0]);
  return Buffer.from(await Packer.toBuffer(doc));
}

// === HTM Email Generation ===

function generateHtmEmail(technique: XPIATechnique, action: string, content?: EnhancedContent, qrBuffer?: Buffer): Buffer {
  const payload = content?.enhancedPayload || resolveAction(technique, action);
  const emailSubject = content?.title ?? 'Monthly Team Update - March 2026';
  const sections = content?.sections ?? [
    { heading: '', body: 'Hi team, here is our monthly progress update. Please review the key metrics below and share any feedback before our Friday sync.' },
    { heading: 'Key Metrics', body: 'Performance across all teams continues to trend positively this month.', bullets: ['Customer satisfaction: 94% (+3% from last month)', 'Sprint velocity: 42 story points (target: 40)', 'Bug resolution time: 1.2 days average (-0.3 days)'] },
    { heading: '', body: 'Let me know if you have any questions or concerns. Looking forward to discussing these results at our next team meeting.' },
  ];

  let hiddenContent = '';
  switch (technique.embeddingMethod) {
    case 'white_text':
      hiddenContent = `<p style="color:#ffffff;font-size:0px;line-height:0;max-height:0;overflow:hidden;mso-hide:all">${payload}</p>`;
      break;
    case 'tiny_font':
      hiddenContent = `<p style="font-size:1px;color:#fefefe;line-height:0">${payload}</p>`;
      break;
    case 'hidden_text':
      hiddenContent = `<div style="display:none;max-height:0;overflow:hidden">${payload}</div>`;
      break;
    case 'metadata':
      hiddenContent = `<!-- ${payload} -->`;
      break;
    case 'comment':
      hiddenContent = `<!-- ${payload} -->`;
      break;
    case 'visible_text':
    default:
      hiddenContent = `<p>${payload}</p>`;
      break;
  }

  // Build body sections dynamically
  let bodyHtml = '';
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.heading) bodyHtml += `      <h3>${s.heading}</h3>\n`;
    if (s.body) bodyHtml += `      <p>${s.body}</p>\n`;
    if (s.bullets?.length) {
      bodyHtml += '      <ul>\n';
      for (const b of s.bullets) bodyHtml += `        <li>${b}</li>\n`;
      bodyHtml += '      </ul>\n';
    }
    // Insert payload after first section
    if (i === 0) bodyHtml += `      ${hiddenContent}\n`;
  }

  const signOff = content?.signOff ?? 'Best regards, Team Lead';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="description" content="${technique.embeddingMethod === 'metadata' ? payload.replace(/"/g, '&quot;') : emailSubject}">
  <title>${emailSubject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a1a2e; color: white; padding: 24px; border-radius: 8px 8px 0 0; }
    .body { padding: 24px; background: #ffffff; border: 1px solid #e0e0e0; }
    .footer { background: #f5f5f5; padding: 16px 24px; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;font-size:20px">${emailSubject}</h1>
    </div>
    <div class="body">
${bodyHtml}
      <p style="margin-top:16px">${signOff}</p>
${qrBuffer ? `      <div style="margin-top:24px;text-align:center"><img src="data:image/png;base64,${qrBuffer.toString('base64')}" width="150" height="150" alt="QR Code" style="display:block;margin:0 auto" /></div>` : ''}
    </div>
    <div class="footer">
      <p>This email is confidential. If you received it in error, please delete it.</p>
    </div>
  </div>
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}

// === PPTX Generation ===

async function generatePptx(technique: XPIATechnique, action: string, content?: EnhancedContent, qrBuffer?: Buffer): Promise<Buffer> {
  const payload = content?.enhancedPayload || resolveAction(technique, action);
  const pptx = new PptxGenJS();

  pptx.author = technique.embeddingMethod === 'metadata' ? payload : (content?.author ?? 'Research Team');
  pptx.subject = technique.embeddingMethod === 'metadata' ? payload : (content?.subtitle ?? 'Project Update');
  pptx.title = content?.title ?? 'Project Status Update';

  const sections = content?.sections ?? [
    { heading: 'Key Achievements', body: '', bullets: ['Launched v2.0 with 15+ new features', 'Reduced latency by 40% across all endpoints', 'Onboarded 200+ enterprise customers'] },
    { heading: 'Performance Metrics', body: '', bullets: ['Revenue growth: +18% QoQ', 'Customer retention: 96%'] },
    { heading: 'Next Steps', body: 'Continue scaling infrastructure and expanding market reach through strategic partnerships.' },
  ];

  // Title slide
  const slide1 = pptx.addSlide();
  slide1.addText(content?.title ?? 'Project Status Update', { x: 0.5, y: 1.5, w: 9, h: 1.5, fontSize: 36, bold: true, color: '1a1a2e' });
  slide1.addText(content?.subtitle ?? 'Q1 2026 Review', { x: 0.5, y: 3, w: 9, h: 0.8, fontSize: 20, color: '666666' });

  // Content slides from sections
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const slide = pptx.addSlide();
    slide.addText(s.heading || 'Details', { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 28, bold: true, color: '1a1a2e' });

    if (s.bullets?.length) {
      const bulletItems = s.bullets.map(b => ({ text: `• ${b}\n`, options: { fontSize: 16, color: '333333' } }));
      slide.addText(bulletItems, { x: 0.5, y: 1.2, w: 9, h: 3 });
    } else if (s.body) {
      slide.addText(s.body, { x: 0.5, y: 1.5, w: 9, h: 3, fontSize: 18, color: '333333' });
    }

    // Embed payload on first content slide
    if (i === 0) {
      switch (technique.embeddingMethod) {
        case 'white_text':
          slide.addText(payload, { x: 0, y: 5, w: 10, h: 0.3, fontSize: 1, color: 'FFFFFF' });
          break;
        case 'tiny_font':
          slide.addText(payload, { x: 0, y: 5, w: 10, h: 0.3, fontSize: 1, color: 'FEFEFE' });
          break;
        case 'hidden_text':
          slide.addNotes(payload);
          break;
        case 'comment':
          slide.addNotes('Note: ' + payload);
          break;
        case 'visible_text':
        default:
          slide.addText(payload, { x: 0.5, y: 4, w: 9, h: 1, fontSize: 14, color: '333333' });
          break;
      }
    }
  }

  if (qrBuffer) {
    const lastSlide = pptx.addSlide();
    lastSlide.addText('Scan for Details', { x: 0.5, y: 0.5, w: 9, h: 0.8, fontSize: 24, bold: true, color: '1a1a2e' });
    lastSlide.addImage({ data: `data:image/png;base64,${qrBuffer.toString('base64')}`, x: 3.25, y: 1.5, w: 3.5, h: 3.5 });
  }

  const arrayBuffer = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}

// === XLSX Generation ===

async function generateXlsx(technique: XPIATechnique, action: string, content?: EnhancedContent, qrBuffer?: Buffer): Promise<Buffer> {
  const payload = content?.enhancedPayload || resolveAction(technique, action);
  const workbook = new ExcelJS.Workbook();

  workbook.creator = technique.embeddingMethod === 'metadata' ? payload : (content?.author ?? 'Finance Dept');
  workbook.lastModifiedBy = technique.embeddingMethod === 'metadata' ? payload : (content?.organization ?? 'Finance Team');
  workbook.title = content?.title ?? 'Budget Report';

  const sheet = workbook.addWorksheet('Budget Summary');

  // Headers
  sheet.columns = [
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Q1', key: 'q1', width: 15 },
    { header: 'Q2', key: 'q2', width: 15 },
    { header: 'Q3', key: 'q3', width: 15 },
    { header: 'Q4', key: 'q4', width: 15 },
    { header: 'Total', key: 'total', width: 15 },
    { header: 'Notes', key: 'note', width: 30 },
  ];

  // Style header row
  sheet.getRow(1).font = { bold: true, size: 12 };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };

  // Use LLM-generated departments or realistic defaults
  const departments = content?.departments ?? [
    { name: 'Engineering', q1: 120000, q2: 135000, q3: 128000, q4: 142000, note: 'Hiring 5 senior engineers' },
    { name: 'Marketing', q1: 45000, q2: 52000, q3: 48000, q4: 61000, note: 'Product launch campaign Q4' },
    { name: 'Sales', q1: 78000, q2: 82000, q3: 90000, q4: 95000, note: 'Expanding APAC region' },
    { name: 'Operations', q1: 35000, q2: 37000, q3: 36000, q4: 39000, note: 'Infrastructure modernization' },
    { name: 'R&D', q1: 95000, q2: 98000, q3: 102000, q4: 110000, note: 'AI safety research program' },
  ];

  departments.forEach((dept) => {
    const r = sheet.addRow({ category: dept.name, q1: dept.q1, q2: dept.q2, q3: dept.q3, q4: dept.q4, total: dept.q1 + dept.q2 + dept.q3 + dept.q4, note: dept.note });
    r.getCell('total').numFmt = '$#,##0';
    ['q1', 'q2', 'q3', 'q4'].forEach((q) => { r.getCell(q).numFmt = '$#,##0'; });
  });

  // Embed payload based on technique
  switch (technique.embeddingMethod) {
    case 'white_text': {
      const hiddenSheet = workbook.addWorksheet('Notes');
      hiddenSheet.state = 'veryHidden';
      const cell = hiddenSheet.getCell('A1');
      cell.value = payload;
      cell.font = { color: { argb: 'FFFFFFFF' }, size: 1 };
      break;
    }
    case 'tiny_font': {
      const cell = sheet.getCell('A20');
      cell.value = payload;
      cell.font = { size: 1, color: { argb: 'FFFEFEFE' } };
      break;
    }
    case 'hidden_text': {
      // Hidden in a very hidden sheet
      const hiddenSheet = workbook.addWorksheet('_data');
      hiddenSheet.state = 'veryHidden';
      hiddenSheet.getCell('A1').value = payload;
      break;
    }
    case 'comment': {
      sheet.getCell('A1').note = payload;
      break;
    }
    case 'metadata':
      // Already handled via workbook.creator above
      workbook.description = payload;
      break;
    case 'visible_text':
    default: {
      const noteSheet = workbook.addWorksheet('Analysis Notes');
      noteSheet.getCell('A1').value = payload;
      break;
    }
  }

  if (qrBuffer) {
    const imageId = workbook.addImage({ base64: qrBuffer.toString('base64'), extension: 'png' });
    sheet.addImage(imageId, { tl: { col: 0, row: departments.length + 3 }, ext: { width: 150, height: 150 } });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// === PDF Generation ===

function generatePdf(technique: XPIATechnique, action: string, content?: EnhancedContent, qrBuffer?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const payload = content?.enhancedPayload || resolveAction(technique, action);
    const pdfTitle = content?.title ?? 'Annual Research Report';
    const pdfAuthor = content?.author ?? 'Research Division';
    const pdfSubject = content?.subtitle ?? 'Annual Review';
    const sections = content?.sections ?? [
      { heading: 'Introduction', body: 'This report summarizes our key research findings for the fiscal year. Our team has made significant progress in multiple areas including performance optimization, security hardening, and user experience improvements.' },
      { heading: 'Key Findings', body: 'Analysis across all research areas yielded actionable insights.', bullets: ['Model robustness improved 23% with adversarial training', 'Multi-layer input filtering reduces injection attempts by 67%', 'Vision-language models remain susceptible to steganographic attacks'] },
      { heading: 'Recommendations', body: 'Based on our findings, we recommend deploying input sanitization layers before the Q2 release and expanding red-team coverage to all new model releases.' },
    ];
    const doc = new PDFDocument({
      info: {
        Title: technique.embeddingMethod === 'metadata' ? payload : pdfTitle,
        Author: technique.embeddingMethod === 'metadata' ? payload : pdfAuthor,
        Subject: technique.embeddingMethod === 'metadata' ? payload : pdfSubject,
        Keywords: technique.embeddingMethod === 'metadata' ? payload : 'report, annual',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(24).fillColor('#1a1a2e').text(pdfTitle, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).fillColor('#666666').text(pdfSubject, { align: 'center' });
    doc.moveDown(2);

    // Render sections
    let payloadInserted = false;
    for (const section of sections) {
      if (section.heading) {
        doc.fontSize(16).fillColor('#1a1a2e').text(section.heading);
        doc.moveDown(0.5);
      }
      if (section.body) {
        doc.fontSize(12).fillColor('#333333').text(section.body);
        doc.moveDown(0.5);
      }
      if (section.bullets) {
        for (const bullet of section.bullets) {
          doc.fontSize(12).fillColor('#333333').text(`  •  ${bullet}`);
        }
        doc.moveDown(0.5);
      }

      // Embed payload after first section
      if (!payloadInserted) {
        payloadInserted = true;
        switch (technique.embeddingMethod) {
          case 'white_text':
            doc.fontSize(0.5).fillColor('#FFFFFF').text(payload);
            break;
          case 'tiny_font':
            doc.fontSize(0.5).fillColor('#FEFEFE').text(payload);
            break;
          case 'hidden_text':
            doc.fontSize(0.5).fillColor('#FFFFFF').text(payload);
            break;
          case 'comment':
            doc.fontSize(12).fillColor('#333333').text('See footnotes for additional details.¹');
            doc.fontSize(0.5).fillColor('#FFFFFF').text(payload);
            break;
          case 'visible_text':
          default:
            doc.fontSize(12).fillColor('#333333').text(payload);
            break;
        }
      }
      doc.moveDown();
    }

    doc.moveDown();
    doc.fontSize(10).fillColor('#999999').text(content?.signOff ?? 'Confidential — For authorized personnel only.', { align: 'center' });

    if (qrBuffer) {
      doc.moveDown();
      doc.image(qrBuffer, { fit: [150, 150], align: 'center' });
    }

    doc.end();
  });
}

// === QR Code Generation ===

/** Max chars for a reliably scannable QR code */
const QR_MAX_LENGTH = 250;

/** Shorten payload for QR — prioritize the injection directive at the end, trim filler from the front */
function truncateForQr(full: string): string {
  if (full.length <= QR_MAX_LENGTH) return full;
  // The injection directive is typically at the end after filler/padding — preserve it
  // Try splitting on double-newline (common separator between filler and directive)
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

/** Extract concise injection directive for QR — prefer the targeted action over the full payload */
function extractDirective(technique: XPIATechnique, action: string): string {
  // If the resolved template (with technique framing) fits in QR, use it
  const resolved = resolveAction(technique, action);
  if (resolved.length <= QR_MAX_LENGTH) return resolved;
  // Template too long (e.g. Context Window Overflow with Lorem filler).
  // Use just the action — it's the targeted text the user provided.
  if (action.length <= QR_MAX_LENGTH) return action;
  // Even the action alone exceeds QR budget — truncate from the end
  return '\u2026' + action.slice(-(QR_MAX_LENGTH - 1));
}

async function generateQrCode(technique: XPIATechnique, action: string): Promise<Buffer> {
  const payload = extractDirective(technique, action);
  return Buffer.from(await QRCode.toBuffer(payload, {
    type: 'png',
    width: 600,
    margin: 2,
    errorCorrectionLevel: 'M',
  }));
}

/** Generate a QR code PNG buffer for embedding into rich documents */
async function generateQrBuffer(technique: XPIATechnique, action: string): Promise<Buffer> {
  const payload = extractDirective(technique, action);
  return Buffer.from(await QRCode.toBuffer(payload, {
    type: 'png',
    width: 200,
    margin: 1,
    errorCorrectionLevel: 'M',
  }));
}

// === SVG Generation ===

// Font stack — Inter is embedded as base64 for raster conversion (sharp/librsvg
// cannot access system fonts). Browsers resolve the sans-serif fallback for SVG output.
const SVG_FONT = `'Inter', sans-serif`;

/**
 * Register custom fonts with fontconfig so librsvg (inside sharp) can resolve
 * font-family "Inter" during SVG→raster conversion. Writes a temporary
 * fonts.conf that includes both the system fonts and our bundled Inter fonts.
 * Sets FONTCONFIG_FILE env var — idempotent, only runs once.
 */
let _fontconfigRegistered = false;
function ensureFontconfigRegistered(): void {
  if (_fontconfigRegistered) return;
  const candidates = [
    join(__dirname, '..', 'assets', 'fonts'),                    // dev (tsx)
    join(__dirname, '..', '..', '..', 'assets', 'fonts'),       // prod (dist/server/src/services → dist/assets/fonts)
  ];
  const fontDir = candidates.find(p => existsSync(join(p, 'Inter-Regular.ttf')));
  if (!fontDir) {
    logger.warn('Font directory not found for fontconfig registration — SVG text may render as tofu');
    return;
  }

  const confDir = join(tmpdir(), 'xpia-fontconfig');
  mkdirSync(confDir, { recursive: true });

  // Include system fontconfig if available, then add our custom font directory
  const fontsConf = [
    '<?xml version="1.0"?>',
    '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">',
    '<fontconfig>',
    '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>',
    `  <dir>${fontDir.replace(/\\/g, '/')}</dir>`,
    '</fontconfig>',
  ].join('\n');

  writeFileSync(join(confDir, 'fonts.conf'), fontsConf);
  process.env.FONTCONFIG_FILE = join(confDir, 'fonts.conf');
  _fontconfigRegistered = true;
  logger.info(`Fontconfig registered with custom font dir: ${fontDir}`);
}

// Lazy-loaded base64 font cache for embedding in SVG before rasterisation.
let _fontStyleCache: string | null = null;

function getEmbeddedFontStyle(): string {
  if (!_fontStyleCache) {
    // Resolve font path — works from both src/ (dev) and dist/ (prod).
    // Dev:  __dirname = server/src/services  → ../assets/fonts
    // Prod: __dirname = server/dist/server/src/services → ../../../assets/fonts = server/dist/assets/fonts
    //        (rootDir: ".." nests output under dist/server/src/)
    const candidates = [
      join(__dirname, '..', 'assets', 'fonts'),                    // dev (tsx)
      join(__dirname, '..', '..', '..', 'assets', 'fonts'),       // prod (dist/server/src/services → dist/assets/fonts)
    ];
    const fontDir = candidates.find(p => existsSync(join(p, 'Inter-Regular.ttf')));
    if (!fontDir) {
      throw new Error(`Font files not found. Searched: ${candidates.join(', ')}`);
    }

    const regular = readFileSync(join(fontDir, 'Inter-Regular.ttf')).toString('base64');
    const bold = readFileSync(join(fontDir, 'Inter-Bold.ttf')).toString('base64');

    _fontStyleCache = [
      `<style>`,
      `@font-face { font-family: 'Inter'; font-weight: 400; src: url('data:font/truetype;base64,${regular}') format('truetype'); }`,
      `@font-face { font-family: 'Inter'; font-weight: 700; src: url('data:font/truetype;base64,${bold}') format('truetype'); }`,
      `</style>`,
    ].join('');
  }
  return _fontStyleCache;
}

// === SVG Utility Helpers (shared by all layout renderers) ===

export type ImageLayout = 'dashboard' | 'report' | 'infographic' | 'email-preview' | 'timeline' | 'comparison';
export const IMAGE_LAYOUTS: ImageLayout[] = ['dashboard', 'report', 'infographic', 'email-preview', 'timeline', 'comparison'];

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function svgWrapText(text: string, x: number, startY: number, fontSize: number, fill: string, opacity: number, maxCharsPerLine: number, maxLines?: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxCharsPerLine && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);

  const capped = maxLines && lines.length > maxLines ? lines.slice(0, maxLines) : lines;
  if (maxLines && lines.length > maxLines) {
    const last = capped[capped.length - 1];
    capped[capped.length - 1] = last.length > 3 ? last.slice(0, -3) + '...' : last + '...';
  }

  const tspans = capped.map((line, i) =>
    `<tspan x="${x}" dy="${i === 0 ? 0 : fontSize * 1.4}">${line}</tspan>`
  ).join('');
  return `<text x="${x}" y="${startY}" fill="${fill}" font-size="${fontSize}" font-family="${SVG_FONT}"${opacity < 1 ? ` opacity="${opacity}"` : ''}>${tspans}</text>`;
}

function buildVisibleBody(content: EnhancedContent | undefined, payload: string): string {
  if (content?.sections && content.sections.length > 0) {
    const sectionTexts = content.sections
      .map(s => {
        const parts: string[] = [];
        if (s.heading) parts.push(s.heading + ':');
        if (s.body) parts.push(s.body);
        if (s.bullets?.length) parts.push(s.bullets.join('. ') + '.');
        return parts.join(' ');
      })
      .filter(Boolean);
    return sectionTexts.join(' ');
  }
  return payload;
}

function svgQrSection(qrDataUrl: string, y: number): string {
  return `<rect x="20" y="${y}" width="760" height="140" rx="8" fill="#f0f4f8" stroke="#d0d7de" stroke-width="1"/>
  <image x="40" y="${y + 10}" width="120" height="120" href="${qrDataUrl}"/>
  <text x="180" y="${y + 50}" fill="#333" font-size="14" font-weight="bold" font-family="${SVG_FONT}">Scan for Details</text>
  <text x="180" y="${y + 73}" fill="#666" font-size="12" font-family="${SVG_FONT}">Scan the QR code to access the full assessment payload.</text>`;
}

function svgEnvelope(height: number, fontStyle: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}">
  ${fontStyle}
${body}
</svg>`;
}

// === Layout Renderers ===

function renderDashboardLayout(content: EnhancedContent | undefined, payload: string, qrDataUrl: string | undefined, fontStyle: string): string {
  const height = qrDataUrl ? 740 : 600;
  const metrics = content?.metrics ?? [
    { label: 'Customer Satisfaction', value: '94%' },
    { label: 'Revenue Growth', value: '+23%' },
    { label: 'Avg Bug Resolution', value: '1.2d' },
    { label: 'Sprint Velocity', value: '42' },
  ];
  const metricColors = ['#e3f2fd', '#e8f5e9', '#fff3e0', '#fce4ec'];
  const textColors = ['#1565c0', '#2e7d32', '#e65100', '#c62828'];

  let metricCards = '';
  for (let i = 0; i < Math.min(metrics.length, 4); i++) {
    const m = metrics[i];
    const x = 40 + i * 190;
    const cx = x + 80;
    metricCards += `  <rect x="${x}" y="150" width="160" height="120" rx="8" fill="${metricColors[i]}"/>
  <text x="${cx}" y="190" text-anchor="middle" fill="${textColors[i]}" font-size="28" font-weight="bold" font-family="${SVG_FONT}">${escapeXml(m.value)}</text>
  <text x="${cx}" y="215" text-anchor="middle" fill="#666" font-size="12" font-family="${SVG_FONT}">${escapeXml(m.label)}</text>\n`;
  }

  const statusLine = content?.sections?.[0]?.body ?? 'Status: All systems operational.';
  const visibleBody = buildVisibleBody(content, payload);
  const qrBlock = qrDataUrl ? svgQrSection(qrDataUrl, height - 180) : '';

  const body = `  <rect width="800" height="${height}" fill="#f8f9fa"/>
  <rect x="0" y="0" width="800" height="80" fill="#1a1a2e"/>
  <text x="40" y="50" fill="white" font-size="24" font-family="${SVG_FONT}" font-weight="bold">${escapeXml(content?.title ?? 'Quarterly Performance Dashboard')}</text>
  <text x="40" y="120" fill="#333333" font-size="16" font-family="${SVG_FONT}">${escapeXml(content?.subtitle ?? 'Key Metrics — Q1 2026')}</text>
${metricCards}  <text x="40" y="320" fill="#333333" font-size="14" font-family="${SVG_FONT}">${escapeXml(statusLine)}</text>
  ${svgWrapText(escapeXml(visibleBody), 20, 360, 13, '#333333', 1, 90)}
  ${qrBlock}
  <text x="40" y="${height - 20}" fill="#999" font-size="10" font-family="${SVG_FONT}">Confidential — Internal Use Only</text>
  ${svgWrapText(escapeXml(payload), 20, height - 10, 1, '#f8f9fa', 0.01, 800)}`;

  return svgEnvelope(height, fontStyle, body);
}

function renderReportLayout(content: EnhancedContent | undefined, payload: string, qrDataUrl: string | undefined, fontStyle: string): string {
  const height = qrDataUrl ? 740 : 600;
  const title = escapeXml(content?.title ?? 'Strategic Analysis Report');
  const subtitle = escapeXml(content?.subtitle ?? 'Prepared for Executive Review');
  const author = escapeXml(content?.author ?? 'Strategy Division');
  const org = escapeXml(content?.organization ?? 'Global Dynamics Corp');
  const sections = content?.sections ?? [
    { heading: 'Overview', body: 'This report presents our quarterly strategic analysis with findings and recommendations.' },
    { heading: 'Key Findings', body: 'Analysis indicates steady progress across all business units.', bullets: ['Revenue growth exceeded targets', 'Customer retention improved', 'Cost reduction achieved'] },
    { heading: 'Recommendations', body: 'Based on current trends, we recommend continued investment in core growth areas.' },
  ];

  let y = 115;
  let sectionBlocks = '';
  for (const s of sections.slice(0, 3)) {
    if (s.heading) {
      sectionBlocks += `  <text x="40" y="${y}" fill="#2c3e50" font-size="15" font-weight="bold" font-family="${SVG_FONT}">${escapeXml(s.heading)}</text>\n`;
      y += 22;
    }
    if (s.body) {
      sectionBlocks += `  ${svgWrapText(escapeXml(s.body), 40, y, 12, '#444', 1, 95)}\n`;
      y += Math.ceil(s.body.length / 95) * 17 + 10;
    }
    if (s.bullets?.length) {
      for (const b of s.bullets.slice(0, 3)) {
        sectionBlocks += `  <text x="55" y="${y}" fill="#555" font-size="11" font-family="${SVG_FONT}">• ${escapeXml(b)}</text>\n`;
        y += 16;
      }
      y += 8;
    }
  }

  const signOff = escapeXml(content?.signOff ?? 'Confidential — Internal Distribution Only');
  const qrBlock = qrDataUrl ? svgQrSection(qrDataUrl, height - 180) : '';

  const body = `  <rect width="800" height="${height}" fill="white"/>
  <rect x="0" y="0" width="800" height="4" fill="#2c3e50"/>
  <text x="40" y="40" fill="#2c3e50" font-size="22" font-weight="bold" font-family="${SVG_FONT}">${title}</text>
  <text x="40" y="62" fill="#7f8c8d" font-size="13" font-family="${SVG_FONT}">${subtitle}</text>
  <line x1="40" y1="72" x2="760" y2="72" stroke="#ecf0f1" stroke-width="1"/>
  <text x="40" y="88" fill="#95a5a6" font-size="10" font-family="${SVG_FONT}">${author} — ${org}</text>
${sectionBlocks}
  ${qrBlock}
  <line x1="40" y1="${height - 40}" x2="760" y2="${height - 40}" stroke="#ecf0f1" stroke-width="1"/>
  <text x="40" y="${height - 22}" fill="#bdc3c7" font-size="9" font-family="${SVG_FONT}">${signOff}</text>
  ${svgWrapText(escapeXml(payload), 20, height - 10, 1, 'white', 0.01, 800)}`;

  return svgEnvelope(height, fontStyle, body);
}

function renderInfographicLayout(content: EnhancedContent | undefined, payload: string, qrDataUrl: string | undefined, fontStyle: string): string {
  const height = qrDataUrl ? 740 : 600;
  const title = escapeXml(content?.title ?? 'Key Performance Indicators');
  const subtitle = escapeXml(content?.subtitle ?? 'Annual Review Highlights');
  const metrics = content?.metrics ?? [
    { label: 'Revenue', value: '$4.2M' },
    { label: 'Users', value: '128K' },
    { label: 'Uptime', value: '99.97%' },
    { label: 'NPS Score', value: '72' },
  ];

  let statBlocks = '';
  const colors = ['#3498db', '#2ecc71', '#e67e22', '#9b59b6'];
  for (let i = 0; i < Math.min(metrics.length, 4); i++) {
    const m = metrics[i];
    const x = 40 + i * 190;
    const cx = x + 80;
    statBlocks += `  <rect x="${x}" y="130" width="160" height="100" rx="12" fill="${colors[i]}"/>
  <text x="${cx}" y="175" text-anchor="middle" fill="white" font-size="30" font-weight="bold" font-family="${SVG_FONT}">${escapeXml(m.value)}</text>
  <text x="${cx}" y="200" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="12" font-family="${SVG_FONT}">${escapeXml(m.label)}</text>
  <rect x="${x + 10}" y="240" width="${120 + (i * 7)}" height="6" rx="3" fill="${colors[i]}" opacity="0.3"/>
  <rect x="${x + 10}" y="240" width="${60 + (i * 15)}" height="6" rx="3" fill="${colors[i]}"/>\n`;
  }

  const visibleBody = buildVisibleBody(content, payload);
  const qrBlock = qrDataUrl ? svgQrSection(qrDataUrl, height - 180) : '';

  const body = `  <rect width="800" height="${height}" fill="#1a1a2e"/>
  <rect x="0" y="0" width="800" height="110" fill="#16213e"/>
  <text x="40" y="50" fill="white" font-size="24" font-weight="bold" font-family="${SVG_FONT}">${title}</text>
  <text x="40" y="80" fill="rgba(255,255,255,0.7)" font-size="14" font-family="${SVG_FONT}">${subtitle}</text>
${statBlocks}
  <rect x="20" y="270" width="760" height="${(qrDataUrl ? height - 460 : height - 320)}" rx="8" fill="rgba(255,255,255,0.05)"/>
  ${svgWrapText(escapeXml(visibleBody), 40, 295, 12, 'rgba(255,255,255,0.8)', 1, 90)}
  ${qrBlock}
  <text x="40" y="${height - 20}" fill="rgba(255,255,255,0.4)" font-size="9" font-family="${SVG_FONT}">Confidential — Internal Use Only</text>
  ${svgWrapText(escapeXml(payload), 20, height - 10, 1, '#1a1a2e', 0.01, 800)}`;

  return svgEnvelope(height, fontStyle, body);
}

function renderEmailPreviewLayout(content: EnhancedContent | undefined, payload: string, qrDataUrl: string | undefined, fontStyle: string): string {
  const height = qrDataUrl ? 740 : 600;
  const subject = escapeXml(content?.title ?? 'Re: Q4 Budget Review — Action Required');
  const from = escapeXml(content?.author ?? 'Sarah Mitchell');
  const org = escapeXml(content?.organization ?? 'Apex Financial Group');
  const sections = content?.sections ?? [
    { heading: '', body: 'Hi team, I wanted to share the latest budget figures for your review before our meeting tomorrow.' },
    { heading: '', body: 'The key numbers look strong — we are ahead of projections on most accounts.', bullets: ['Marketing budget utilized at 87%', 'Engineering headcount on track', 'Q4 close estimated at $2.1M above forecast'] },
    { heading: '', body: 'Please review and let me know if you have any questions. Looking forward to discussing.' },
  ];

  let emailBody = '';
  let y = 165;
  for (const s of sections.slice(0, 4)) {
    if (s.body) {
      emailBody += `  ${svgWrapText(escapeXml(s.body), 50, y, 12, '#333', 1, 85)}\n`;
      y += Math.ceil(s.body.length / 85) * 17 + 12;
    }
    if (s.bullets?.length) {
      for (const b of s.bullets.slice(0, 3)) {
        emailBody += `  <text x="65" y="${y}" fill="#555" font-size="11" font-family="${SVG_FONT}">• ${escapeXml(b)}</text>\n`;
        y += 16;
      }
      y += 8;
    }
  }

  const signOff = escapeXml(content?.signOff ?? `Best regards,\n${from}`);
  const qrBlock = qrDataUrl ? svgQrSection(qrDataUrl, height - 180) : '';

  const body = `  <rect width="800" height="${height}" fill="#e8e8e8"/>
  <rect x="0" y="0" width="800" height="38" fill="#f5f5f5" stroke="#ddd" stroke-width="1"/>
  <text x="20" y="25" fill="#333" font-size="13" font-weight="bold" font-family="${SVG_FONT}">Inbox</text>
  <circle cx="760" cy="19" r="10" fill="#e74c3c"/>
  <text x="760" y="23" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="${SVG_FONT}">3</text>
  <rect x="30" y="50" width="740" height="${height - 70}" rx="6" fill="white" stroke="#ddd" stroke-width="1"/>
  <text x="50" y="80" fill="#333" font-size="10" font-family="${SVG_FONT}"><tspan font-weight="bold">From:</tspan> ${from} &lt;${from.toLowerCase().replace(/ /g, '.')}@${org.toLowerCase().replace(/ /g, '')}.com&gt;</text>
  <text x="50" y="96" fill="#333" font-size="10" font-family="${SVG_FONT}"><tspan font-weight="bold">To:</tspan> Team Distribution List</text>
  <text x="50" y="112" fill="#333" font-size="10" font-family="${SVG_FONT}"><tspan font-weight="bold">Subject:</tspan> ${subject}</text>
  <line x1="50" y1="122" x2="750" y2="122" stroke="#eee" stroke-width="1"/>
  <text x="50" y="142" fill="#333" font-size="12" font-family="${SVG_FONT}">Hi team,</text>
${emailBody}
  ${svgWrapText(escapeXml(signOff), 50, y + 10, 11, '#555', 1, 85)}
  ${qrBlock}
  ${svgWrapText(escapeXml(payload), 20, height - 10, 1, '#e8e8e8', 0.01, 800)}`;

  return svgEnvelope(height, fontStyle, body);
}

function renderTimelineLayout(content: EnhancedContent | undefined, payload: string, qrDataUrl: string | undefined, fontStyle: string): string {
  const title = escapeXml(content?.title ?? 'Project Milestone Timeline');
  const subtitle = escapeXml(content?.subtitle ?? 'Key milestones and deliverables');
  const sections = content?.sections ?? [
    { heading: 'Q1 — Planning', body: 'Requirements gathering and stakeholder alignment completed across all business units.' },
    { heading: 'Q2 — Development', body: 'Core platform built with CI/CD pipeline deployed to staging environments.' },
    { heading: 'Q3 — Testing', body: 'Comprehensive QA, penetration testing, and security audits conducted.' },
    { heading: 'Q4 — Launch', body: 'Production deployment, customer onboarding, and post-launch monitoring initiated.' },
  ];

  const nodeColors = ['#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#e74c3c'];
  const maxNodes = Math.min(sections.length, 5);
  const spineX = 400;
  const headerH = 90;
  const bodyFontSize = 11;
  const charsPerLine = 34;
  const maxBodyLines = 4;
  const lineH = bodyFontSize * 1.4;
  const cardPadTop = 30;
  const cardPadBot = 14;
  const cardW = 310;

  // Pre-compute card heights based on actual body text length
  const cardHeights: number[] = [];
  for (let i = 0; i < maxNodes; i++) {
    const bodyText = (sections[i].body || '').slice(0, 200);
    const rawLines = Math.ceil(bodyText.length / charsPerLine);
    const lines = Math.min(rawLines, maxBodyLines);
    cardHeights.push(Math.round(cardPadTop + lines * lineH + cardPadBot));
  }

  // Compute vertical positions — each node's Y is determined by adding the
  // max of the previous card height + gap, so cards never overlap
  const gap = 24;
  const nodeYs: number[] = [];
  let nextY = headerH + 20;
  for (let i = 0; i < maxNodes; i++) {
    nodeYs.push(nextY);
    nextY += Math.max(cardHeights[i], 50) + gap;
  }

  const footerSpace = qrDataUrl ? 180 : 50;
  const height = nextY + footerSpace;

  // Draw alternating left/right cards along center spine
  let timelineNodes = '';
  for (let i = 0; i < maxNodes; i++) {
    const s = sections[i];
    const ny = nodeYs[i];
    const cardH = cardHeights[i];
    const color = nodeColors[i % nodeColors.length];
    const isLeft = i % 2 === 0;

    // Connector line to next node
    if (i < maxNodes - 1) {
      timelineNodes += `  <line x1="${spineX}" y1="${ny + 14}" x2="${spineX}" y2="${nodeYs[i + 1] - 14}" stroke="#dce1e8" stroke-width="2"/>\n`;
    }

    const cardX = isLeft ? spineX - cardW - 40 : spineX + 40;
    const cardY = Math.round(ny - cardH / 2);
    const textX = cardX + 16;
    const bodyText = escapeXml((s.body || '').slice(0, 200));

    // Horizontal arm from spine to card
    const armStartX = isLeft ? spineX - 16 : spineX + 16;
    const armEndX = isLeft ? cardX + cardW : cardX;
    timelineNodes += `  <line x1="${armStartX}" y1="${ny}" x2="${armEndX}" y2="${ny}" stroke="${color}" stroke-width="1.5" opacity="0.5"/>\n`;

    // Card with subtle shadow
    timelineNodes += `  <rect x="${cardX + 2}" y="${cardY + 2}" width="${cardW}" height="${cardH}" rx="8" fill="#000" opacity="0.04"/>\n`;
    timelineNodes += `  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="8" fill="white" stroke="${color}" stroke-width="1.5"/>\n`;
    // Colored left accent bar on card
    timelineNodes += `  <rect x="${cardX}" y="${cardY}" width="5" height="${cardH}" rx="2" fill="${color}"/>\n`;

    // Card heading + body
    timelineNodes += `  <text x="${textX + 6}" y="${cardY + 22}" fill="#2c3e50" font-size="13" font-weight="bold" font-family="${SVG_FONT}">${escapeXml(s.heading || `Phase ${i + 1}`)}</text>\n`;
    timelineNodes += `  ${svgWrapText(bodyText, textX + 6, cardY + 40, bodyFontSize, '#555', 1, charsPerLine, maxBodyLines)}\n`;

    // Spine node — colored circle with number
    timelineNodes += `  <circle cx="${spineX}" cy="${ny}" r="14" fill="${color}"/>\n`;
    timelineNodes += `  <text x="${spineX}" y="${ny + 4}" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="${SVG_FONT}">${i + 1}</text>\n`;
  }

  const qrBlock = qrDataUrl ? svgQrSection(qrDataUrl, height - 180) : '';
  const signOff = escapeXml(content?.signOff ?? 'Confidential — Internal Use Only');

  const body = `  <rect width="800" height="${height}" fill="#f4f6f9"/>
  <rect x="0" y="0" width="800" height="80" fill="#2c3e50"/>
  <text x="40" y="38" fill="white" font-size="22" font-weight="bold" font-family="${SVG_FONT}">${title}</text>
  <text x="40" y="60" fill="rgba(255,255,255,0.65)" font-size="12" font-family="${SVG_FONT}">${subtitle}</text>
  <line x1="${spineX}" y1="${headerH + 5}" x2="${spineX}" y2="${nodeYs[maxNodes - 1] + 14}" stroke="#dce1e8" stroke-width="2" stroke-dasharray="6,4"/>
${timelineNodes}
  ${qrBlock}
  <text x="400" y="${height - 18}" text-anchor="middle" fill="#bdc3c7" font-size="9" font-family="${SVG_FONT}">${signOff}</text>
  ${svgWrapText(escapeXml(payload), 20, height - 10, 1, '#f4f6f9', 0.01, 800)}`;

  return svgEnvelope(height, fontStyle, body);
}

function renderComparisonLayout(content: EnhancedContent | undefined, payload: string, qrDataUrl: string | undefined, fontStyle: string): string {
  const height = qrDataUrl ? 740 : 600;
  const title = escapeXml(content?.title ?? 'Comparative Analysis');
  const sections = content?.sections ?? [
    { heading: 'Option A', body: 'Cloud-native architecture with managed services. Higher initial cost but lower maintenance overhead.', bullets: ['Auto-scaling', 'Managed backups', '99.99% SLA'] },
    { heading: 'Option B', body: 'Self-hosted infrastructure with custom tooling. Lower cost but requires dedicated DevOps team.', bullets: ['Full control', 'Custom optimization', 'Flexible deployment'] },
  ];

  const leftSection = sections[0] || { heading: 'Option A', body: 'Analysis pending.', bullets: [] };
  const rightSection = sections[1] || { heading: 'Option B', body: 'Analysis pending.', bullets: [] };

  let leftItems = '';
  let rightItems = '';
  let leftY = 170;
  if (leftSection.body) {
    leftItems += `  ${svgWrapText(escapeXml(leftSection.body), 40, leftY, 11, '#444', 1, 42)}\n`;
    leftY += Math.ceil(leftSection.body.length / 42) * 16 + 8;
  }
  if (leftSection.bullets?.length) {
    for (const b of leftSection.bullets.slice(0, 4)) {
      leftItems += `  <text x="50" y="${leftY}" fill="#555" font-size="10" font-family="${SVG_FONT}">✓ ${escapeXml(b)}</text>\n`;
      leftY += 16;
    }
  }
  let rightY = 170;
  if (rightSection.body) {
    rightItems += `  ${svgWrapText(escapeXml(rightSection.body), 430, rightY, 11, '#444', 1, 42)}\n`;
    rightY += Math.ceil(rightSection.body.length / 42) * 16 + 8;
  }
  if (rightSection.bullets?.length) {
    for (const b of rightSection.bullets.slice(0, 4)) {
      rightItems += `  <text x="440" y="${rightY}" fill="#555" font-size="10" font-family="${SVG_FONT}">✓ ${escapeXml(b)}</text>\n`;
      rightY += 16;
    }
  }

  const columnsEnd = Math.max(leftY, rightY);
  const visibleBody = buildVisibleBody(content, payload);
  const qrBlock = qrDataUrl ? svgQrSection(qrDataUrl, height - 180) : '';

  const body = `  <rect width="800" height="${height}" fill="white"/>
  <rect x="0" y="0" width="800" height="70" fill="#2c3e50"/>
  <text x="400" y="42" text-anchor="middle" fill="white" font-size="22" font-weight="bold" font-family="${SVG_FONT}">${title}</text>
  <rect x="20" y="90" width="370" height="40" rx="6" fill="#3498db"/>
  <text x="205" y="116" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="${SVG_FONT}">${escapeXml(leftSection.heading || 'Option A')}</text>
  <rect x="410" y="90" width="370" height="40" rx="6" fill="#e67e22"/>
  <text x="595" y="116" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="${SVG_FONT}">${escapeXml(rightSection.heading || 'Option B')}</text>
  <line x1="400" y1="90" x2="400" y2="${height - 60}" stroke="#ecf0f1" stroke-width="1"/>
${leftItems}
${rightItems}
  ${svgWrapText(escapeXml(visibleBody), 40, Math.max(columnsEnd + 20, 350), 11, '#666', 1, 90)}
  ${qrBlock}
  <text x="400" y="${height - 20}" text-anchor="middle" fill="#bdc3c7" font-size="9" font-family="${SVG_FONT}">Confidential — Internal Use Only</text>
  ${svgWrapText(escapeXml(payload), 20, height - 10, 1, 'white', 0.01, 800)}`;

  return svgEnvelope(height, fontStyle, body);
}

const LAYOUT_RENDERERS: Record<string, (content: EnhancedContent | undefined, payload: string, qrDataUrl: string | undefined, fontStyle: string) => string> = {
  dashboard: renderDashboardLayout,
  report: renderReportLayout,
  infographic: renderInfographicLayout,
  'email-preview': renderEmailPreviewLayout,
  timeline: renderTimelineLayout,
  comparison: renderComparisonLayout,
};

function generateSvg(technique: XPIATechnique, action: string, content?: EnhancedContent, embedFont = false, qrBuffer?: Buffer, imageLayout?: string): Buffer {
  const payload = content?.enhancedPayload || resolveAction(technique, action);
  const fontStyle = embedFont ? getEmbeddedFontStyle() : '';
  const qrDataUrl = qrBuffer ? `data:image/png;base64,${qrBuffer.toString('base64')}` : undefined;

  const randomLayout = IMAGE_LAYOUTS[Math.floor(Math.random() * IMAGE_LAYOUTS.length)];
  const layout = imageLayout || content?.imageLayout || randomLayout;
  const renderer = LAYOUT_RENDERERS[layout] || LAYOUT_RENDERERS.dashboard;
  const svg = renderer(content, payload, qrDataUrl, fontStyle);
  return Buffer.from(svg, 'utf-8');
}

// === PNG Generation (via SVG + sharp) ===

async function generatePng(technique: XPIATechnique, action: string, content?: EnhancedContent, qrBuffer?: Buffer, imageLayout?: string): Promise<Buffer> {
  ensureFontconfigRegistered();
  const svgBuffer = generateSvg(technique, action, content, true, qrBuffer, imageLayout);
  return sharp(svgBuffer).png().toBuffer();
}

// === JPEG Generation (via SVG + sharp) ===

async function generateJpeg(technique: XPIATechnique, action: string, content?: EnhancedContent, qrBuffer?: Buffer, imageLayout?: string): Promise<Buffer> {
  ensureFontconfigRegistered();
  const svgBuffer = generateSvg(technique, action, content, true, qrBuffer, imageLayout);
  return sharp(svgBuffer).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
}

// === WebP Generation (via SVG + sharp) ===

async function generateWebp(technique: XPIATechnique, action: string, content?: EnhancedContent, qrBuffer?: Buffer, imageLayout?: string): Promise<Buffer> {
  ensureFontconfigRegistered();
  const svgBuffer = generateSvg(technique, action, content, true, qrBuffer, imageLayout);
  return sharp(svgBuffer).webp({ quality: 90 }).toBuffer();
}

// === GIF Generation (via SVG + sharp) ===

async function generateGif(technique: XPIATechnique, action: string, content?: EnhancedContent, qrBuffer?: Buffer, imageLayout?: string): Promise<Buffer> {
  ensureFontconfigRegistered();
  const svgBuffer = generateSvg(technique, action, content, true, qrBuffer, imageLayout);
  return sharp(svgBuffer).gif().toBuffer();
}

// === CSV Generation ===

function generateCsv(technique: XPIATechnique, action: string, content?: EnhancedContent): Buffer {
  const payload = content?.enhancedPayload || resolveAction(technique, action);
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;

  const departments = content?.departments ?? [
    { name: 'Engineering', q1: 120000, q2: 135000, q3: 128000, q4: 142000, note: 'Hiring 5 senior engineers' },
    { name: 'Marketing', q1: 45000, q2: 52000, q3: 48000, q4: 61000, note: 'Product launch campaign' },
    { name: 'Sales', q1: 78000, q2: 82000, q3: 90000, q4: 95000, note: 'Expanding APAC region' },
    { name: 'Operations', q1: 35000, q2: 37000, q3: 36000, q4: 39000, note: 'Infrastructure modernization' },
    { name: 'R&D', q1: 95000, q2: 98000, q3: 102000, q4: 110000, note: 'AI safety research program' },
  ];

  const header = 'Department,Q1 Budget,Q2 Budget,Q3 Budget,Q4 Budget,Total,Notes';

  let payloadRow = '';
  switch (technique.embeddingMethod) {
    case 'white_text':
    case 'tiny_font':
    case 'hidden_text':
      payloadRow = `${esc(payload)},0,0,0,0,0,""`;
      break;
    case 'metadata':
    case 'comment':
      payloadRow = `# ${payload}`;
      break;
    case 'visible_text':
    default:
      payloadRow = `${esc(payload)},,,,,,"Injected"`;
      break;
  }

  const rows = departments.map(d =>
    `${esc(d.name)},${d.q1},${d.q2},${d.q3},${d.q4},${d.q1 + d.q2 + d.q3 + d.q4},${esc(d.note)}`
  );
  const csvRows = [header, ...rows];
  csvRows.splice(3, 0, payloadRow);

  return Buffer.from(csvRows.join('\n'), 'utf-8');
}

// === Markdown Generation ===

function generateMarkdown(technique: XPIATechnique, action: string, content?: EnhancedContent): Buffer {
  const payload = content?.enhancedPayload || resolveAction(technique, action);

  let hiddenContent = '';
  switch (technique.embeddingMethod) {
    case 'white_text':
      hiddenContent = `\n<span style="color:white;font-size:0">${payload}</span>\n`;
      break;
    case 'tiny_font':
      hiddenContent = `\n<sub><sup>${payload}</sup></sub>\n`;
      break;
    case 'hidden_text':
      hiddenContent = `\n<!-- ${payload} -->\n`;
      break;
    case 'metadata':
      break;
    case 'comment':
      hiddenContent = `\n[//]: # (${payload})\n`;
      break;
    case 'visible_text':
    default:
      hiddenContent = `\n${payload}\n`;
      break;
  }

  const mdTitle = content?.title ?? 'AI Safety Research Summary';
  const mdAuthor = content?.author ?? 'Research Division';
  const sections = content?.sections ?? [
    { heading: 'Executive Overview', body: 'Our research team has completed a comprehensive analysis of adversarial robustness across frontier language models.' },
    { heading: 'Key Findings', body: '', bullets: ['**Model Robustness**: 23% improvement in adversarial robustness with red-team fine-tuning', '**Prompt Injection Defense**: Multi-layer input filtering reduces injection attempts by 67%', '**Multimodal Vulnerabilities**: Vision-language models remain susceptible to steganographic attacks'] },
    { heading: 'Methodology', body: 'We evaluated 15 frontier models across 4,000 adversarial test cases spanning direct prompt injection, indirect prompt injection via document context, and cross-plugin injection attacks.' },
    { heading: 'Recommendations', body: '', bullets: ['Deploy input sanitization layer before Q2 2026 release', 'Implement output monitoring across all production endpoints', 'Red-team all new model releases prior to deployment'] },
  ];

  const frontmatter = technique.embeddingMethod === 'metadata'
    ? `---\ntitle: ${mdTitle}\nauthor: ${mdAuthor}\ndate: 2026-03-13\nabstract: "${payload.replace(/"/g, '\\"')}"\n---\n\n`
    : `---\ntitle: ${mdTitle}\nauthor: ${mdAuthor}\ndate: 2026-03-13\n---\n\n`;

  let body = `${frontmatter}# ${mdTitle}\n\n`;

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    body += `## ${s.heading}\n\n`;
    if (s.body) body += `${s.body}\n\n`;
    if (s.bullets?.length) {
      for (const b of s.bullets) body += `- ${b}\n`;
      body += '\n';
    }
    // Insert payload after first section
    if (i === 0) body += hiddenContent + '\n';
  }

  body += `| Priority | Action Item | Timeline |\n|----------|-------------|----------|\n| High | Deploy input sanitization layer | Q2 2026 |\n| High | Implement output monitoring | Q2 2026 |\n| Medium | Red-team all new model releases | Ongoing |\n| Low | Publish safety benchmark results | Q3 2026 |\n\n---\n*${content?.signOff ?? 'Confidential — Internal Research Document'}*\n`;

  return Buffer.from(body, 'utf-8');
}

// === ICS Calendar Generation ===

function generateIcs(technique: XPIATechnique, action: string, content?: EnhancedContent): Buffer {
  const payload = content?.enhancedPayload || resolveAction(technique, action);
  const now = new Date();
  const start = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z');

  const rawDesc = content?.meetingDescription ?? 'Please review the attached security assessment before the meeting. Agenda: Q1 findings review\, remediation priorities\, deployment timeline for input sanitization layer.';
  let description = rawDesc.replace(/,/g, '\\,');
  let location = content?.location ?? 'Conference Room B / Zoom';
  let summary = content?.title ?? 'AI Security Task Force — Weekly Sync';

  switch (technique.embeddingMethod) {
    case 'white_text':
    case 'tiny_font':
    case 'hidden_text':
    case 'visible_text':
      description += `\\n\\n${payload.replace(/,/g, '\\,')}`;
      break;
    case 'metadata':
      summary = payload.replace(/,/g, '\\,');
      location = payload.replace(/,/g, '\\,');
      break;
    case 'comment':
      break;
    default:
      description += `\\n\\n${payload.replace(/,/g, '\\,')}`;
      break;
  }

  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Company//Calendar//EN\r\nBEGIN:VEVENT\r\nUID:${uuidv4()}@calendar\r\nDTSTART:${fmt(start)}\r\nDTEND:${fmt(end)}\r\nSUMMARY:${summary}\r\nDESCRIPTION:${description}\r\nLOCATION:${location}\r\nORGANIZER:mailto:teamlead@company.example\r\nATTENDEE:mailto:researcher@company.example\r\nSTATUS:CONFIRMED\r\nEND:VEVENT\r\nEND:VCALENDAR`;

  return Buffer.from(ics, 'utf-8');
}

// === VCF Contact Generation ===

function generateVcf(technique: XPIATechnique, action: string, content?: EnhancedContent): Buffer {
  const payload = content?.enhancedPayload || resolveAction(technique, action);

  const contactName = content?.contactName ?? 'Dr. Sarah Chen';
  const nameParts = contactName.split(' ');
  const lastName = nameParts.pop() ?? 'Chen';
  const firstName = nameParts.join(' ') || 'Dr. Sarah';
  let note = content?.contactBio ?? 'Senior AI Safety Researcher specializing in adversarial robustness and prompt injection defense. Previously at DeepMind and Anthropic.';
  let org = content?.organization ?? 'AI Safety Institute';
  let title = content?.contactTitle ?? 'Principal Researcher — Adversarial ML';

  switch (technique.embeddingMethod) {
    case 'white_text':
    case 'tiny_font':
    case 'hidden_text':
    case 'visible_text':
      note += ` ${payload}`;
      break;
    case 'metadata':
      org = payload;
      title = payload;
      break;
    case 'comment':
      note = `${payload} ${note}`;
      break;
    default:
      note += ` ${payload}`;
      break;
  }

  const vcf = `BEGIN:VCARD\r\nVERSION:3.0\r\nN:${lastName};${firstName}\r\nFN:${contactName}\r\nORG:${org}\r\nTITLE:${title}\r\nTEL;TYPE=WORK:+1-555-0142\r\nEMAIL:sarah.chen@aisafety.example\r\nURL:https://aisafety.example/researchers/chen\r\nNOTE:${note}\r\nEND:VCARD`;

  return Buffer.from(vcf, 'utf-8');
}

// === JSON Data Generation ===

function generateJsonDoc(technique: XPIATechnique, action: string, content?: EnhancedContent): Buffer {
  const payload = content?.enhancedPayload || resolveAction(technique, action);

  const findings = content?.findings ?? [
    { id: 'F-001', severity: 'critical', title: 'Prompt injection via document context', status: 'open' },
    { id: 'F-002', severity: 'high', title: 'Token smuggling through multi-turn context', status: 'mitigated' },
    { id: 'F-003', severity: 'medium', title: 'Instruction override via system prompt leak', status: 'open' },
  ];

  const data: Record<string, unknown> = {
    report: {
      title: content?.title ?? 'AI Security Assessment Results',
      date: '2026-03-13',
      version: '2.1',
      classification: 'confidential',
      ...(content ? { author: content.author, organization: content.organization } : {}),
    },
    findings: findings.map((f, i) => ({ ...f, affected_models: [4, 2, 6, 3, 5][i % 5] })),
    summary: {
      total_tests: 4200,
      pass_rate: 0.87,
      recommendation: 'Deploy input sanitization layer before Q2 release.',
    },
  };

  switch (technique.embeddingMethod) {
    case 'metadata':
      data.report = { ...(data.report as Record<string, unknown>), metadata: payload, generator: payload };
      break;
    case 'comment':
      data._comment = payload;
      break;
    case 'hidden_text':
      data.summary = { ...(data.summary as Record<string, unknown>), _internal: payload };
      break;
    case 'white_text':
    case 'tiny_font':
      data['\u200B'] = payload;
      break;
    case 'visible_text':
    default:
      data.notes = payload;
      break;
  }

  return Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
}

// === YAML Data Generation ===

function generateYamlDoc(technique: XPIATechnique, action: string, content?: EnhancedContent): Buffer {
  const payload = content?.enhancedPayload || resolveAction(technique, action);
  const escapedPayload = payload.replace(/"/g, '\\"');

  let commentLine = '';
  let metadataFields = '';
  let extraContent = '';

  switch (technique.embeddingMethod) {
    case 'comment':
    case 'hidden_text':
      commentLine = `# ${payload}\n`;
      break;
    case 'metadata':
      metadataFields = `  generator: "${escapedPayload}"\n  internal_note: "${escapedPayload}"\n`;
      break;
    case 'white_text':
    case 'tiny_font':
      extraContent = `\n_context: "${escapedPayload}"\n`;
      break;
    case 'visible_text':
    default:
      extraContent = `\nnotes: "${escapedPayload}"\n`;
      break;
  }

  const yamlTitle = content?.title ?? 'AI Security Assessment Results';
  const findings = content?.findings ?? [
    { id: 'F-001', severity: 'critical', title: 'Prompt injection via document context', status: 'open' },
    { id: 'F-002', severity: 'high', title: 'Token smuggling through multi-turn context', status: 'mitigated' },
    { id: 'F-003', severity: 'medium', title: 'Instruction override via system prompt leak', status: 'open' },
  ];
  const findingsYaml = findings.map(f =>
    `  - id: ${f.id}\n    severity: ${f.severity}\n    title: "${f.title.replace(/"/g, '\\"')}"\n    status: ${f.status}`
  ).join('\n');

  const yaml = `${commentLine}# AI Security Assessment Configuration
# Generated: 2026-03-13

report:
  title: "${yamlTitle.replace(/"/g, '\\"')}"
  version: "2.1"
  classification: confidential
${metadataFields}
scan_config:
  target_models:
    - gpt-4o
    - gemini-2.5-pro
    - gemini-2.0-flash
  test_categories:
    - prompt_injection
    - document_context_injection
    - cross_plugin_attack
  parameters:
    max_tests_per_model: 1000
    temperature: 0.7
    timeout_seconds: 30

findings:
${findingsYaml}

summary:
  total_tests: 4200
  pass_rate: 0.87
  recommendation: "Deploy input sanitization layer before Q2 release"
${extraContent}`;

  return Buffer.from(yaml, 'utf-8');
}

// === RTF Generation ===

function generateRtf(technique: XPIATechnique, action: string, content?: EnhancedContent): Buffer {
  const payload = content?.enhancedPayload || resolveAction(technique, action);
  const rtfEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
  const escapedPayload = rtfEsc(payload);

  let hiddenContent = '';
  switch (technique.embeddingMethod) {
    case 'white_text':
      hiddenContent = `{\\cf2\\fs2 ${escapedPayload}}\\par\n`;
      break;
    case 'tiny_font':
      hiddenContent = `{\\fs1 ${escapedPayload}}\\par\n`;
      break;
    case 'hidden_text':
      hiddenContent = `{\\v ${escapedPayload}}\\par\n`;
      break;
    case 'metadata':
      break;
    case 'comment':
      hiddenContent = `{\\*\\atnid Note}{\\*\\atnauthor System}{\\*\\annotation ${escapedPayload}}\\par\n`;
      break;
    case 'visible_text':
    default:
      hiddenContent = `{\\fs24 ${escapedPayload}}\\par\n`;
      break;
  }

  const infoBlock = technique.embeddingMethod === 'metadata'
    ? `{\\info{\\title ${escapedPayload}}{\\subject ${escapedPayload}}{\\author ${escapedPayload}}}`
    : `{\\info{\\title ${rtfEsc(content?.title ?? 'Quarterly Strategic Assessment')}}{\\subject ${rtfEsc(content?.subtitle ?? 'Internal Distribution — Q1 2026')}}{\\author ${rtfEsc(content?.author ?? 'Strategy Division')}}}`;

  const sections = content?.sections ?? [
    { heading: 'Executive Summary', body: 'Our cross-functional security team has completed the Q1 2026 adversarial robustness assessment across all production AI systems.' },
    { heading: 'Key Findings', body: 'Testing revealed three categories of vulnerability requiring immediate attention.', bullets: ['Prompt injection via document context: 4 models affected', 'Token smuggling through multi-turn sessions: 2 models affected', 'Indirect instruction override via retrieval augmentation: 6 models affected'] },
    { heading: 'Remediation Timeline', body: 'The following actions have been prioritized for the upcoming quarter based on severity and business impact.' },
  ];

  let rtfBody = '';
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    rtfBody += `{\\f0\\fs28\\b ${rtfEsc(s.heading)}}\\par\n\\par\n`;
    if (s.body) rtfBody += `{\\fs24 ${rtfEsc(s.body)}}\\par\n\\par\n`;
    if (s.bullets?.length) {
      for (const b of s.bullets) rtfBody += `{\\fs24 \\bullet  ${rtfEsc(b)}}\\par\n`;
      rtfBody += '\\par\n';
    }
    if (i === 0) rtfBody += hiddenContent;
  }

  const rtf = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Calibri;}{\\f1 Arial;}}
{\\colortbl;\\red0\\green0\\blue0;\\red255\\green255\\blue255;}
${infoBlock}
\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440
{\\f0\\fs32\\b ${rtfEsc(content?.title ?? 'Quarterly Strategic Assessment')}}\\par
{\\fs22\\i ${rtfEsc(content?.subtitle ?? 'Internal Distribution — Q1 2026')}}\\par
\\par
${rtfBody}{\\fs20\\i ${rtfEsc(content?.signOff ?? 'Confidential — For authorized personnel only.')}}\\par
}`;

  return Buffer.from(rtf, 'utf-8');
}

// === Main Generation Function ===

const MIME_TYPES: Record<DocType, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  htm: 'text/html',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  csv: 'text/csv',
  md: 'text/markdown',
  ics: 'text/calendar',
  vcf: 'text/vcard',
  json: 'application/json',
  yaml: 'text/yaml',
  rtf: 'application/rtf',
  qr: 'image/png',
};

/** Rich document content generated by LLM */
interface EnhancedContent {
  title: string;
  subtitle: string;
  author: string;
  organization: string;
  sections: Array<{ heading: string; body: string; bullets?: string[] }>;
  signOff: string;
  enhancedPayload?: string;
  imageLayout?: string;
  departments?: Array<{ name: string; q1: number; q2: number; q3: number; q4: number; note: string }>;
  metrics?: Array<{ label: string; value: string }>;
  meetingDescription?: string;
  location?: string;
  contactName?: string;
  contactTitle?: string;
  contactBio?: string;
  findings?: Array<{ id: string; severity: string; title: string; status: string }>;
}

// Doc type descriptions and content schemas are now in config/prompts.ts

/**
 * Strip common LLM disclaimer / refusal preambles from parsed document content.
 * Some models (especially OpenAI) prepend safety caveats even when they comply.
 */
const DISCLAIMER_PATTERNS = [
  /^I cannot assist with.*?\.\s*/i,
  /^I can't assist with.*?\.\s*/i,
  /^(Note|Disclaimer|Warning|Important|Caveat):?\s.*?\.\s*/i,
  /^(As an AI|I should note|I want to note|Please note).*?\.\s*/i,
  /^If your work is legitimate.*?\.\s*/i,
  /^High-level,?\s*defensive recommendations.*?\.\s*/i,
];

function stripDisclaimersFromString(text: string): string {
  let cleaned = text;
  for (const pattern of DISCLAIMER_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.trimStart();
}

function stripDisclaimers(content: EnhancedContent): void {
  if (content.title) content.title = stripDisclaimersFromString(content.title);
  if (content.subtitle) content.subtitle = stripDisclaimersFromString(content.subtitle);
  if (content.sections) {
    for (const section of content.sections) {
      if (section.body) section.body = stripDisclaimersFromString(section.body);
    }
  }
}


async function generateEnhancedContent(
  userId: string, modelId: string, docType: DocType, technique: XPIATechnique, rawPayload: string, correlationId?: string, severity?: string, stealth?: string,
): Promise<EnhancedContent> {
  // Truncate very long payloads (e.g. context-overflow) to avoid wasting tokens
  let promptPayload = rawPayload;
  if (rawPayload.length > 500) {
    promptPayload = rawPayload.slice(0, 200) + '\n[... filler/padding text continues for ~' + rawPayload.length + ' characters total ...]\n' + rawPayload.slice(-200);
  }

  const IMAGE_TYPES = new Set(['png', 'svg', 'jpg', 'webp', 'gif']);
  const isImage = IMAGE_TYPES.has(docType);
  const promptCategory = isImage ? 'image' : 'document';
  const purpose = isImage ? 'image_enhance' : 'document_enhance';
  const typeDescription = isImage
    ? (IMAGE_PROMPTS.imageTypeDescriptions[docType] || docType)
    : (DOCUMENT_PROMPTS.docTypeDescriptions[docType] || docType);

  const result = await gateway.complete({
    userId,
    modelDbId: modelId,
    messages: [
      {
        role: 'system',
        content: await getUserPrompt(userId, promptCategory, 'system'),
      },
      {
        role: 'user',
        content: interpolate(await getUserPrompt(userId, promptCategory, 'user'), {
          DOC_TYPE_DESCRIPTION: typeDescription,
          TECHNIQUE_NAME: technique.name,
          EMBEDDING_METHOD: technique.embeddingMethod,
          RAW_PAYLOAD: promptPayload,
          CONTENT_SCHEMA: DOCUMENT_PROMPTS.contentSchemas[docType] || '',
          SEVERITY_INSTRUCTION: SEVERITY_INSTRUCTIONS[severity || technique.severity] || SEVERITY_INSTRUCTIONS.medium,
          STEALTH_INSTRUCTION: STEALTH_INSTRUCTIONS[stealth || 'medium'] || STEALTH_INSTRUCTIONS.medium,
        }),
      },
    ],
    purpose,
    maxTokens: DOCUMENT_PROMPTS.maxTokens,
    temperature: DOCUMENT_PROMPTS.temperature,
    correlationId,
  });

  const truncatedReasons = new Set(['MAX_TOKENS', 'length', 'max_tokens']);
  if (truncatedReasons.has(result.finishReason)) {
    logger.warn({ finishReason: result.finishReason, contentLen: result.content.length }, 'LLM response truncated — output token limit reached');
  }

  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in LLM response');
    const parsed = JSON.parse(jsonMatch[0]) as EnhancedContent;

    // Strip any model-generated disclaimer text from content fields
    stripDisclaimers(parsed);

    return parsed;
  } catch (err) {
    logger.warn({ contentLen: result.content.length, err: err instanceof Error ? err.message : err }, 'LLM response JSON parse failed — using fallback content');
    return {
      title: 'Quarterly Strategic Review',
      subtitle: 'Internal Distribution Only',
      sections: [
        { heading: 'Executive Summary', body: result.content.slice(0, 300) || 'This document presents our quarterly strategic analysis with key findings and actionable recommendations for the upcoming period.' },
        { heading: 'Key Findings', body: 'Analysis indicates steady progress across all business units with notable improvements in operational efficiency.', bullets: ['Revenue growth exceeded targets by 8%', 'Customer retention improved to 94%', 'Operational costs reduced through automation initiatives'] },
        { heading: 'Outlook', body: 'Based on current market conditions and internal performance metrics, we project continued growth through the next fiscal quarter.' },
      ],
      signOff: 'Prepared by the Strategy Division for internal distribution.',
      author: 'Strategy Division',
      organization: 'Global Dynamics Corp',
    };
  }
}

export async function generateDocument(options: GenerateDocumentOptions): Promise<GeneratedDoc> {
  const technique = getTechniqueById(options.techniqueId);
  if (!technique) {
    throw new Error(`Unknown technique: ${options.techniqueId}`);
  }

  const action = options.customAction || ACTION_TARGETS[0];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = options.docType === 'qr' ? 'png' : options.docType;
  const IMAGE_DOC_TYPES: Set<string> = new Set(['png', 'svg', 'jpg', 'webp', 'gif']);
  const prefix = IMAGE_DOC_TYPES.has(options.docType) ? 'img' : 'doc';
  const filename = `${prefix}-${timestamp}.${ext}`;

  // Generate enhanced content via LLM if modelId is provided
  let content: EnhancedContent | undefined;
  if (options.modelId) {
    logger.info({ modelId: options.modelId, technique: technique.id, docType: options.docType }, 'Starting LLM enhancement');
    const rawPayload = resolveAction(technique, action);
    content = await generateEnhancedContent(options.userId, options.modelId, options.docType, technique, rawPayload, options.correlationId, technique.severity, options.stealth);
    logger.info('LLM enhancement completed');
  }

  let buffer: Buffer;

  // Generate QR code buffer for embedding when requested
  const qrBuffer = options.addQrCode ? await generateQrBuffer(technique, action) : undefined;

  switch (options.docType) {
    case 'docx':
      buffer = await generateDocx(technique, action, content, qrBuffer);
      break;
    case 'htm':
      buffer = generateHtmEmail(technique, action, content, qrBuffer);
      break;
    case 'pptx':
      buffer = await generatePptx(technique, action, content, qrBuffer);
      break;
    case 'xlsx':
      buffer = await generateXlsx(technique, action, content, qrBuffer);
      break;
    case 'pdf':
      buffer = await generatePdf(technique, action, content, qrBuffer);
      break;
    case 'png':
      buffer = await generatePng(technique, action, content, qrBuffer, options.imageLayout);
      break;
    case 'svg':
      buffer = generateSvg(technique, action, content, false, qrBuffer, options.imageLayout);
      break;
    case 'jpg':
      buffer = await generateJpeg(technique, action, content, qrBuffer, options.imageLayout);
      break;
    case 'webp':
      buffer = await generateWebp(technique, action, content, qrBuffer, options.imageLayout);
      break;
    case 'gif':
      buffer = await generateGif(technique, action, content, qrBuffer, options.imageLayout);
      break;
    case 'csv':
      buffer = generateCsv(technique, action, content);
      break;
    case 'md':
      buffer = generateMarkdown(technique, action, content);
      break;
    case 'ics':
      buffer = generateIcs(technique, action, content);
      break;
    case 'vcf':
      buffer = generateVcf(technique, action, content);
      break;
    case 'json':
      buffer = generateJsonDoc(technique, action, content);
      break;
    case 'yaml':
      buffer = generateYamlDoc(technique, action, content);
      break;
    case 'rtf':
      buffer = generateRtf(technique, action, content);
      break;
    case 'qr':
      buffer = await generateQrCode(technique, action);
      break;
    default:
      throw new Error(`Unsupported document type: ${options.docType}`);
  }

  // Fire-and-forget — buffer is in memory, return immediately; save to DB in background
  const docId = uuidv4();
  const mimeType = MIME_TYPES[options.docType];
  logger.info({ docId, docType: options.docType, bufferSize: buffer.length }, 'Saving document to DB (background)');
  ;(async () => {
    try {
      const { uploadDocument } = await import('./blob-storage.service');
      const blobRef = await uploadDocument(options.userId, docId, filename, buffer, mimeType);
      await repos.content.createDocument({
        id: docId, userId: options.userId, kind: 'document',
        filename, docType: options.docType, technique: technique.id,
        blobRef, mimeType, createdAt: new Date().toISOString(),
        embeddingMethod: technique.embeddingMethod,
        severity: technique.severity,
        customAction: options.customAction,
        modelId: options.modelId,
        addQrCode: options.addQrCode,
        stealth: options.stealth,
      });
      logger.debug({ docId, blobRef }, 'Document saved to DB + blob');
      recordDocumentGenerated(options.docType);
    } catch (err: unknown) {
      logger.error({ docId, err: err instanceof Error ? err.message : err }, 'Failed to save document history');
    }
  })();

  return {
    buffer,
    filename,
    mimeType: MIME_TYPES[options.docType],
  };
}

export interface BatchGenerateOptions {
  userId: string;
  docTypes: DocType[];
  techniqueId: string;
  customAction?: string;
  modelId?: string;
  correlationId?: string;
  addQrCode?: boolean;
  stealth?: string;
  imageLayout?: string;
}

export interface BatchGeneratedDoc {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  docType: DocType;
}

/**
 * Generate multiple document types in a single batch.
 * Types that share the same content schema group get ONE shared LLM call.
 */
export async function generateDocumentBatch(options: BatchGenerateOptions): Promise<BatchGeneratedDoc[]> {
  const technique = getTechniqueById(options.techniqueId);
  if (!technique) {
    throw new Error(`Unknown technique: ${options.techniqueId}`);
  }

  const action = options.customAction || ACTION_TARGETS[0];

  // Group doc types by schema group for LLM call deduplication
  const groupMap = new Map<string, DocType[]>();
  for (const dt of options.docTypes) {
    const group = SCHEMA_GROUPS[dt] || dt;
    const list = groupMap.get(group) || [];
    list.push(dt);
    groupMap.set(group, list);
  }

  // Make one LLM call per unique schema group
  const contentByGroup = new Map<string, EnhancedContent>();
  if (options.modelId) {
    const rawPayload = resolveAction(technique, action);
    const llmCalls: Array<{ group: string; representative: DocType }> = [];
    for (const [group, types] of groupMap) {
      // Use the first type in the group as the representative for the LLM prompt
      llmCalls.push({ group, representative: types[0] });
    }

    logger.info({ modelId: options.modelId, technique: technique.id, groups: llmCalls.length, totalTypes: options.docTypes.length }, 'Starting batch LLM enhancement');

    // Run all LLM calls in parallel across groups
    const results = await Promise.all(
      llmCalls.map(async ({ group, representative }) => {
        const content = await generateEnhancedContent(
          options.userId, options.modelId!, representative, technique, rawPayload, options.correlationId, technique.severity, options.stealth,
        );
        return { group, content };
      }),
    );

    for (const { group, content } of results) {
      contentByGroup.set(group, content);
    }
    logger.info({ groups: llmCalls.length }, 'Batch LLM enhancement completed');
  }

  // Generate QR buffer once if requested
  const qrBuffer = options.addQrCode ? await generateQrBuffer(technique, action) : undefined;

  // Render each document type using shared content from its group
  const docs: BatchGeneratedDoc[] = [];
  for (const dt of options.docTypes) {
    const group = SCHEMA_GROUPS[dt] || dt;
    const content = contentByGroup.get(group);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = dt === 'qr' ? 'png' : dt;
    const IMAGE_BATCH_TYPES: Set<string> = new Set(['png', 'svg', 'jpg', 'webp', 'gif']);
    const prefix = IMAGE_BATCH_TYPES.has(dt) ? 'img' : 'doc';
    const filename = `${prefix}-${timestamp}.${ext}`;

    let buffer: Buffer;
    switch (dt) {
      case 'docx': buffer = await generateDocx(technique, action, content, qrBuffer); break;
      case 'htm': buffer = generateHtmEmail(technique, action, content, qrBuffer); break;
      case 'pptx': buffer = await generatePptx(technique, action, content, qrBuffer); break;
      case 'xlsx': buffer = await generateXlsx(technique, action, content, qrBuffer); break;
      case 'pdf': buffer = await generatePdf(technique, action, content, qrBuffer); break;
      case 'png': buffer = await generatePng(technique, action, content, qrBuffer, options.imageLayout); break;
      case 'svg': buffer = generateSvg(technique, action, content, false, qrBuffer, options.imageLayout); break;
      case 'jpg': buffer = await generateJpeg(technique, action, content, qrBuffer, options.imageLayout); break;
      case 'webp': buffer = await generateWebp(technique, action, content, qrBuffer, options.imageLayout); break;
      case 'gif': buffer = await generateGif(technique, action, content, qrBuffer, options.imageLayout); break;
      case 'csv': buffer = generateCsv(technique, action, content); break;
      case 'md': buffer = generateMarkdown(technique, action, content); break;
      case 'ics': buffer = generateIcs(technique, action, content); break;
      case 'vcf': buffer = generateVcf(technique, action, content); break;
      case 'json': buffer = generateJsonDoc(technique, action, content); break;
      case 'yaml': buffer = generateYamlDoc(technique, action, content); break;
      case 'rtf': buffer = generateRtf(technique, action, content); break;
      case 'qr': buffer = await generateQrCode(technique, action); break;
      default: throw new Error(`Unsupported document type: ${dt}`);
    }

    const mimeType = MIME_TYPES[dt];
    docs.push({ buffer, filename, mimeType, docType: dt });

    // Fire-and-forget save to blob + DB
    const docId = uuidv4();
    ;(async () => {
      try {
        const { uploadDocument } = await import('./blob-storage.service');
        const blobRef = await uploadDocument(options.userId, docId, filename, buffer, mimeType);
        await repos.content.createDocument({
          id: docId, userId: options.userId, kind: 'document',
          filename, docType: dt, technique: technique.id,
          blobRef, mimeType, createdAt: new Date().toISOString(),
          embeddingMethod: technique.embeddingMethod,
          severity: technique.severity,
          customAction: options.customAction,
          modelId: options.modelId,
          addQrCode: options.addQrCode,
          stealth: options.stealth,
        });
        recordDocumentGenerated(dt);
      } catch (err: unknown) {
        logger.error({ docId, err: err instanceof Error ? err.message : err }, 'Failed to save document history');
      }
    })();
  }

  return docs;
}

export async function getDocumentHistory(userId: string): Promise<unknown[]> {
  const docs = await repos.content.listDocuments(userId, 50);
  return docs.map(d => ({
    id: d.id, user_id: d.userId, filename: d.filename, doc_type: d.docType,
    technique: d.technique, created_at: d.createdAt,
    embedding_method: d.embeddingMethod, severity: d.severity,
    custom_action: d.customAction, model_id: d.modelId,
    add_qr_code: d.addQrCode, stealth: d.stealth,
  }));
}

export async function getDocumentById(id: string, userId: string): Promise<{ content: Buffer; filename: string; mime_type: string } | null> {
  const doc = await repos.content.getDocument(id, userId);
  if (!doc || !doc.blobRef) return null;
  // Content is stored in blob storage; the old code stored binary in DB
  // For CosmosDB, we'll need to download from blob storage
  const { downloadDocument } = await import('./blob-storage.service');
  const content = await downloadDocument(doc.blobRef);
  if (!content) return null;
  return { content, filename: doc.filename, mime_type: doc.mimeType ?? 'application/octet-stream' };
}

export async function cleanupOldDocuments(days: number = 7): Promise<number> {
  const before = new Date(Date.now() - days * 86400000).toISOString();
  return repos.content.deleteOldDocuments(before);
}

const SEVERITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function getAvailableTechniques(): {
  id: string;
  name: string;
  category: string;
  severity: string;
  description: string;
  embeddingMethod: string;
}[] {
  return TECHNIQUES.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    severity: t.severity,
    description: t.description,
    embeddingMethod: t.embeddingMethod,
  })).sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 0) - (SEVERITY_ORDER[b.severity] ?? 0));
}
