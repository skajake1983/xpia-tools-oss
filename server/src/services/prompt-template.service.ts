import { v4 as uuidv4 } from 'uuid';
import repos from '../db/repos';
import type { PromptTemplateDoc } from '../db/repositories/types';
import { DOCUMENT_PROMPTS, PAYLOAD_PROMPTS, PAGE_PROMPTS, IMAGE_PROMPTS } from '../config/prompts';

const MAX_TEMPLATES_PER_USER = 30;

export type PromptCategory = 'document' | 'image' | 'payload' | 'page';

export interface PromptTemplate {
  id: string;
  userId: string | null;
  category: PromptCategory;
  name: string;
  systemPrompt: string;
  userPrompt: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

function docToTemplate(doc: PromptTemplateDoc): PromptTemplate {
  return {
    id: doc.id,
    userId: doc.userId,
    category: doc.category,
    name: doc.name,
    systemPrompt: doc.systemPrompt,
    userPrompt: doc.userPrompt,
    isSystem: doc.isSystem,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Get all templates visible to a user (their own + system defaults) */
export async function getTemplatesForUser(userId: string): Promise<PromptTemplate[]> {
  const docs = await repos.config.getTemplatesForUser(userId);
  return docs.map(docToTemplate);
}

/** Get a single template by ID (must be owned by user or system) */
export async function getTemplate(userId: string, templateId: string): Promise<PromptTemplate | null> {
  const doc = await repos.config.getTemplate(templateId);
  if (!doc) return null;
  if (doc.userId !== userId && !doc.isSystem) return null;
  return docToTemplate(doc);
}

/** Create a new user template */
export async function createTemplate(
  userId: string,
  data: { category: PromptCategory; name: string; systemPrompt: string; userPrompt: string },
): Promise<PromptTemplate> {
  const count = await repos.config.countUserTemplates(userId);
  if (count >= MAX_TEMPLATES_PER_USER) {
    throw new Error(`Maximum of ${MAX_TEMPLATES_PER_USER} templates reached`);
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  await repos.config.createTemplate({
    id, type: 'prompt_template', userId, category: data.category,
    name: data.name, systemPrompt: data.systemPrompt, userPrompt: data.userPrompt,
    isSystem: false, createdAt: now, updatedAt: now,
  });

  return (await getTemplate(userId, id))!;
}

/** Update an existing user-owned template (cannot modify system templates) */
export async function updateTemplate(
  userId: string,
  templateId: string,
  data: { name?: string; systemPrompt?: string; userPrompt?: string },
): Promise<PromptTemplate> {
  const existing = await repos.config.getTemplate(templateId);
  if (!existing || existing.userId !== userId || existing.isSystem) {
    throw new Error('Template not found or cannot be modified');
  }

  await repos.config.updateTemplate(templateId, {
    name: data.name ?? existing.name,
    systemPrompt: data.systemPrompt ?? existing.systemPrompt,
    userPrompt: data.userPrompt ?? existing.userPrompt,
    updatedAt: new Date().toISOString(),
  });

  return (await getTemplate(userId, templateId))!;
}

/** Delete a user-owned template (cannot delete system templates) */
export async function deleteTemplate(userId: string, templateId: string): Promise<void> {
  const existing = await repos.config.getTemplate(templateId);
  if (!existing || existing.userId !== userId || existing.isSystem) {
    throw new Error('Template not found or cannot be deleted');
  }

  // Remove any active assignments pointing to this template, then delete it
  const actives = await repos.config.getActivePrompts(userId);
  for (const a of actives) {
    if (a.templateId === templateId) {
      await repos.config.clearActivePrompt(userId, a.category);
    }
  }
  await repos.config.deleteTemplate(templateId);
}

/** Set the active template for a category */
export async function setActiveTemplate(userId: string, category: PromptCategory, templateId: string): Promise<void> {
  const tpl = await getTemplate(userId, templateId);
  if (!tpl) {
    throw new Error('Template not found');
  }
  if (tpl.category !== category) {
    throw new Error('Template category mismatch');
  }

  await repos.config.setActivePrompt({
    id: `${userId}:${category}`,
    type: 'user_active_prompt',
    userId,
    category,
    templateId,
  });
}

/** Clear the active template for a category (reverts to system default) */
export async function clearActiveTemplate(userId: string, category: PromptCategory): Promise<void> {
  await repos.config.clearActivePrompt(userId, category);
}

/** Get the user's active template assignments */
export async function getActiveTemplates(userId: string): Promise<Record<string, string>> {
  const actives = await repos.config.getActivePrompts(userId);
  const result: Record<string, string> = {};
  for (const a of actives) {
    result[a.category] = a.templateId;
  }
  return result;
}

// Code-level defaults as final fallback (in case system templates don't exist in DB)
const CODE_DEFAULTS: Record<PromptCategory, { system: string; user: string }> = {
  document: { system: DOCUMENT_PROMPTS.system, user: DOCUMENT_PROMPTS.user },
  image: { system: IMAGE_PROMPTS.system, user: IMAGE_PROMPTS.user },
  payload: { system: PAYLOAD_PROMPTS.system, user: PAYLOAD_PROMPTS.user },
  page: { system: PAGE_PROMPTS.system, user: PAGE_PROMPTS.user },
};

/**
 * Get the effective prompt text for a generation call.
 * Priority: user's active template → system default template → code default.
 */
export async function getUserPrompt(userId: string, category: PromptCategory, type: 'system' | 'user'): Promise<string> {
  // Check for active assignment
  const actives = await repos.config.getActivePrompts(userId);
  const active = actives.find(a => a.category === category);

  if (active) {
    const tpl = await repos.config.getTemplate(active.templateId);
    if (tpl) {
      return type === 'system' ? tpl.systemPrompt : tpl.userPrompt;
    }
  }

  // Fall back to system default template
  const allTemplates = await repos.config.getTemplatesForUser(userId);
  const systemTpl = allTemplates.find(t => t.category === category && t.isSystem);

  if (systemTpl) {
    return type === 'system' ? systemTpl.systemPrompt : systemTpl.userPrompt;
  }

  // Final fallback: code defaults
  return CODE_DEFAULTS[category][type];
}
