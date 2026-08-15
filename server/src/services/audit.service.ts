// ── Admin Audit Log Service ─────────────────────────────────────────────
// Records admin actions for accountability. Writes are fire-and-forget
// to avoid impacting request latency.

import { v4 as uuidv4 } from 'uuid';
import repos from '../db/repos';
import type { AuditLogDoc } from '../db/repositories/types';
import logger from '../logger';

/** 90-day retention for audit log entries (in seconds) */
const AUDIT_RETENTION_SECONDS = 90 * 24 * 60 * 60;

export interface AuditEntry {
  action: string;
  actorId: string;
  actorEmail: string;
  targetType: AuditLogDoc['targetType'];
  targetId: string;
  targetLabel: string;
  detail: string;
}

/** Fire-and-forget audit log write */
export function logAudit(entry: AuditEntry): void {
  const doc: AuditLogDoc = {
    id: uuidv4(),
    type: 'audit_log',
    action: entry.action,
    actorId: entry.actorId,
    actorEmail: entry.actorEmail,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    detail: entry.detail,
    createdAt: new Date().toISOString(),
    ttl: AUDIT_RETENTION_SECONDS,
  };

  repos.config.createAuditLog(doc).catch((err) => {
    logger.error({ err, entry }, 'Failed to write audit log');
  });
}

/** Query audit log entries with optional search and pagination */
export async function getAuditLogs(opts?: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ logs: AuditLogDoc[]; total: number; page: number; pageSize: number }> {
  const page = opts?.page ?? 0;
  const pageSize = opts?.pageSize ?? 20;
  const { logs, total } = await repos.config.queryAuditLogs({
    search: opts?.search,
    limit: pageSize,
    offset: page * pageSize,
  });
  return { logs, total, page, pageSize };
}
