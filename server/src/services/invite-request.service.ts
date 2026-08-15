import { v4 as uuidv4 } from 'uuid';
import repos from '../db/repos';
import { createInviteCode } from './invite.service';

export interface InviteRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  organization: string;
  job_title: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** Map CosmosDB doc shape → legacy snake_case interface for route compat */
function toInviteRequest(doc: { id: string; firstName: string; lastName: string; email: string; organization: string; jobTitle: string; status: 'pending' | 'approved' | 'rejected'; reviewedBy: string | null; reviewedAt: string | null; createdAt: string }): InviteRequest {
  return {
    id: doc.id,
    first_name: doc.firstName,
    last_name: doc.lastName,
    email: doc.email,
    organization: doc.organization,
    job_title: doc.jobTitle,
    status: doc.status,
    reviewed_by: doc.reviewedBy,
    reviewed_at: doc.reviewedAt,
    created_at: doc.createdAt,
  };
}

export async function createRequest(data: {
  firstName: string;
  lastName: string;
  email: string;
  organization: string;
  jobTitle: string;
}): Promise<InviteRequest> {
  const email = data.email.toLowerCase().trim();

  const existing = await repos.config.getInviteRequestByEmail(email, 'pending');
  if (existing) {
    throw new Error('A pending request already exists for this email');
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  await repos.config.createInviteRequest({
    id,
    type: 'invite_request',
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    email,
    organization: data.organization.trim(),
    jobTitle: data.jobTitle.trim(),
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
  });

  const doc = (await repos.config.getInviteRequest(id))!;
  return toInviteRequest(doc);
}

export async function listRequests(status?: 'pending' | 'approved' | 'rejected'): Promise<InviteRequest[]> {
  const docs = await repos.config.listInviteRequests(status);
  return docs.map(toInviteRequest);
}

export async function getRequestById(id: string): Promise<InviteRequest | null> {
  const doc = await repos.config.getInviteRequest(id);
  return doc ? toInviteRequest(doc) : null;
}

export async function approveRequest(
  requestId: string,
  reviewerId: string,
): Promise<{ request: InviteRequest; inviteCode: string }> {
  const req = await repos.config.getInviteRequest(requestId);
  if (!req) throw new Error('Request not found');
  if (req.status !== 'pending') throw new Error('Request is no longer pending');

  await repos.config.updateInviteRequest(requestId, {
    status: 'approved',
    reviewedBy: reviewerId,
    reviewedAt: new Date().toISOString(),
  });

  // Auto-generate a person-bound invite code
  const { code } = await createInviteCode(reviewerId, {
    email: req.email,
    firstName: req.firstName,
    lastName: req.lastName,
    organization: req.organization,
    jobTitle: req.jobTitle,
    expiresInHours: 168, // 7 days
  });

  const updated = (await repos.config.getInviteRequest(requestId))!;
  return { request: toInviteRequest(updated), inviteCode: code };
}

export async function rejectRequest(requestId: string, reviewerId: string): Promise<InviteRequest> {
  const req = await repos.config.getInviteRequest(requestId);
  if (!req) throw new Error('Request not found');
  if (req.status !== 'pending') throw new Error('Request is no longer pending');

  await repos.config.updateInviteRequest(requestId, {
    status: 'rejected',
    reviewedBy: reviewerId,
    reviewedAt: new Date().toISOString(),
  });

  const updated = (await repos.config.getInviteRequest(requestId))!;
  return toInviteRequest(updated);
}
