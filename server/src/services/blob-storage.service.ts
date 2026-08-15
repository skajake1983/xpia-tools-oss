import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { config } from '../config';
import logger from '../logger';

let containerClient: ContainerClient | null = null;
let documentsContainerClient: ContainerClient | null = null;

function getContainerClient(): ContainerClient | null {
  if (!config.azureStorageConnectionString) return null;
  if (!containerClient) {
    const blobService = BlobServiceClient.fromConnectionString(config.azureStorageConnectionString);
    containerClient = blobService.getContainerClient(config.azureStorageContainer);
  }
  return containerClient;
}

function getDocumentsContainerClient(): ContainerClient | null {
  if (!config.azureStorageConnectionString) return null;
  if (!documentsContainerClient) {
    const blobService = BlobServiceClient.fromConnectionString(config.azureStorageConnectionString);
    documentsContainerClient = blobService.getContainerClient('documents');
  }
  return documentsContainerClient;
}

/**
 * Ensure the 'documents' blob container exists (called once at startup).
 */
export async function ensureDocumentsContainer(): Promise<void> {
  const client = getDocumentsContainerClient();
  if (!client) return;
  await client.createIfNotExists();
}

/**
 * Upload an HTML page to Azure Blob Storage static site.
 * File is stored as `{slug}/index.html` for clean URL routing.
 */
export async function uploadPage(slug: string, htmlContent: string): Promise<void> {
  const client = getContainerClient();
  if (!client) return; // No-op in dev without Azure config

  const blobName = `${slug}/index.html`;
  const blockBlob = client.getBlockBlobClient(blobName);
  await blockBlob.upload(htmlContent, Buffer.byteLength(htmlContent, 'utf-8'), {
    blobHTTPHeaders: {
      blobContentType: 'text/html; charset=utf-8',
      blobCacheControl: 'public, max-age=3600',
    },
  });
}

/**
 * Delete a page from Azure Blob Storage.
 */
export async function deletePage(slug: string): Promise<void> {
  const client = getContainerClient();
  if (!client) return;

  const blobName = `${slug}/index.html`;
  const blockBlob = client.getBlockBlobClient(blobName);
  await blockBlob.deleteIfExists();
}

/**
 * Upload root index.html (redirect) and 404.html (page-removed) to the $web container.
 * Called once during deployment to ensure the static site has proper root + error pages.
 */
export async function uploadStaticAssets(): Promise<void> {
  const client = getContainerClient();
  if (!client) return;

  const staticDir = join(__dirname, '..', '..', '..', 'static-pages');
  if (!existsSync(staticDir)) {
    logger.warn({ staticDir }, 'Static-pages directory not found — skipping upload');
    return;
  }

  const files = [
    { blobName: 'index.html', localPath: join(staticDir, 'index.html') },
    { blobName: '404.html', localPath: join(staticDir, '404.html') },
  ];

  for (const { blobName, localPath } of files) {
    if (!existsSync(localPath)) {
      logger.warn({ localPath }, 'Static asset missing — skipping');
      continue;
    }
    const content = readFileSync(localPath, 'utf-8');
    const blockBlob = client.getBlockBlobClient(blobName);
    await blockBlob.upload(content, Buffer.byteLength(content, 'utf-8'), {
      blobHTTPHeaders: {
        blobContentType: 'text/html; charset=utf-8',
        blobCacheControl: 'public, max-age=3600',
      },
    });
  }
}

/**
 * Returns true if Azure Blob Storage is configured.
 */
export function isConfigured(): boolean {
  return !!config.azureStorageConnectionString;
}

// ── Document binary storage ─────────────────────────────────────────────
// Documents (DOCX, PDF, RTF, QR PNG) are stored in the 'documents' container
// with path: {userId}/{documentId}/{filename}
// When Azure Blob Storage is not configured, falls back to local filesystem.

const LOCAL_DOCS_DIR = join(process.cwd(), 'data', 'documents');

/**
 * Upload a document binary to the 'documents' blob container.
 * Falls back to local filesystem when blob storage is not configured.
 * Returns the blob path (used as blobRef in CosmosDB).
 */
export async function uploadDocument(
  userId: string,
  documentId: string,
  filename: string,
  content: Buffer,
  mimeType: string,
): Promise<string | null> {
  const blobPath = `${userId}/${documentId}/${filename}`;
  const client = getDocumentsContainerClient();
  if (client) {
    const blockBlob = client.getBlockBlobClient(blobPath);
    await blockBlob.upload(content, content.length, {
      blobHTTPHeaders: { blobContentType: mimeType },
    });
    return blobPath;
  }

  // Local filesystem fallback (skippable for stateless clients like the CLI)
  if (process.env.XPIA_NO_LOCAL_DOC_STORE === '1') return blobPath;
  const localPath = join(LOCAL_DOCS_DIR, blobPath);
  mkdirSync(dirname(localPath), { recursive: true });
  writeFileSync(localPath, content);
  return blobPath;
}

/**
 * Download a document binary from the 'documents' blob container.
 * Falls back to local filesystem when blob storage is not configured.
 * Returns the buffer or null if not found.
 */
export async function downloadDocument(blobPath: string): Promise<Buffer | null> {
  const client = getDocumentsContainerClient();
  if (client) {
    const blockBlob = client.getBlockBlobClient(blobPath);
    try {
      const response = await blockBlob.download(0);
      if (!response.readableStreamBody) return null;
      const chunks: Buffer[] = [];
      for await (const chunk of response.readableStreamBody) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (e: any) {
      if (e.statusCode === 404) return null;
      throw e;
    }
  }

  // Local filesystem fallback
  const localPath = join(LOCAL_DOCS_DIR, blobPath);
  if (!existsSync(localPath)) return null;
  return readFileSync(localPath);
}

/**
 * Delete a document binary from the 'documents' blob container.
 */
export async function deleteDocument(blobPath: string): Promise<void> {
  const client = getDocumentsContainerClient();
  if (client) {
    const blockBlob = client.getBlockBlobClient(blobPath);
    await blockBlob.deleteIfExists();
    return;
  }

  // Local filesystem fallback
  const localPath = join(LOCAL_DOCS_DIR, blobPath);
  if (existsSync(localPath)) unlinkSync(localPath);
}
