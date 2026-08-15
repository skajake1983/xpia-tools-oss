import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import repos from '../db/repos';
import {
  getTemplatesForUser,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setActiveTemplate,
  clearActiveTemplate,
  getActiveTemplates,
  getUserPrompt,
} from './prompt-template.service';

describe('Prompt Template Service', () => {
  const userEmail = `tpl-test-${Date.now()}@example.com`;
  const user2Email = `tpl-test2-${Date.now()}@example.com`;
  let userId: string;
  let user2Id: string;

  function makeUserDoc(id: string, email: string) {
    const now = new Date().toISOString();
    return {
      id,
      email,
      passwordHash: bcrypt.hashSync('TestPass1!', 4),
      totpSecret: null,
      totpEnabled: false,
      isAdmin: false,
      isSuperadmin: false,
      forcePasswordChange: false,
      firstName: null,
      lastName: null,
      organization: null,
      jobTitle: null,
      linkedinUrl: null,
      termsAcceptedAt: null,
      canGenerateInvites: false,
      emailVerified: false,
      limits: { dailyTokenLimit: 0, isSuspended: false, updatedBy: null },
      createdAt: now,
      updatedAt: now,
    };
  }

  beforeAll(async () => {
    userId = uuidv4();
    user2Id = uuidv4();
    await repos.users.create(makeUserDoc(userId, userEmail));
    await repos.users.create(makeUserDoc(user2Id, user2Email));
  });

  afterAll(async () => {
    await repos.users.delete(userId);
    await repos.users.delete(user2Id);
  });

  describe('system defaults', () => {
    it('should have 4 system-default templates after migration', async () => {
      const templates = await getTemplatesForUser(userId);
      const systemTemplates = templates.filter(t => t.isSystem);
      expect(systemTemplates).toHaveLength(4);
      expect(systemTemplates.map(t => t.category).sort()).toEqual(['document', 'image', 'page', 'payload']);
    });

    it('system templates should have non-empty prompts', async () => {
      const templates = (await getTemplatesForUser(userId)).filter(t => t.isSystem);
      for (const t of templates) {
        expect(t.systemPrompt.length).toBeGreaterThan(0);
        expect(t.userPrompt.length).toBeGreaterThan(0);
      }
    });
  });

  describe('CRUD', () => {
    let createdId: string;

    it('should create a user template', async () => {
      const tpl = await createTemplate(userId, {
        category: 'document',
        name: 'My Custom Doc Prompt',
        systemPrompt: 'Custom system prompt for documents',
        userPrompt: 'Custom user prompt with {{DOC_TYPE_DESCRIPTION}}',
      });
      createdId = tpl.id;
      expect(tpl.userId).toBe(userId);
      expect(tpl.category).toBe('document');
      expect(tpl.name).toBe('My Custom Doc Prompt');
      expect(tpl.isSystem).toBe(false);
    });

    it('should list user templates + system defaults', async () => {
      const all = await getTemplatesForUser(userId);
      expect(all.length).toBeGreaterThanOrEqual(4); // 3 system + at least 1 user
      expect(all.some(t => t.id === createdId)).toBe(true);
    });

    it('should get a single template', async () => {
      const tpl = await getTemplate(userId, createdId);
      expect(tpl).toBeDefined();
      expect(tpl!.name).toBe('My Custom Doc Prompt');
    });

    it('should not see another user\'s templates', async () => {
      const tpl = await getTemplate(user2Id, createdId);
      expect(tpl).toBeNull();
    });

    it('should update a user template', async () => {
      const updated = await updateTemplate(userId, createdId, { name: 'Renamed Prompt' });
      expect(updated.name).toBe('Renamed Prompt');
      expect(updated.systemPrompt).toBe('Custom system prompt for documents');
    });

    it('should not update system templates', async () => {
      const systemTpl = (await getTemplatesForUser(userId)).find(t => t.isSystem)!;
      await expect(async () => await updateTemplate(userId, systemTpl.id, { name: 'Hacked' })).rejects.toThrow(/not found or cannot/);
    });

    it('should not delete system templates', async () => {
      const systemTpl = (await getTemplatesForUser(userId)).find(t => t.isSystem)!;
      await expect(async () => await deleteTemplate(userId, systemTpl.id)).rejects.toThrow(/not found or cannot/);
    });

    it('should delete a user template', async () => {
      await deleteTemplate(userId, createdId);
      expect(await getTemplate(userId, createdId)).toBeNull();
    });
  });

  describe('30-template cap', () => {
    const ids: string[] = [];

    afterAll(async () => {
      for (const id of ids) {
        try { await deleteTemplate(user2Id, id); } catch { /* already deleted */ }
      }
    });

    it('should enforce 30-template limit', async () => {
      for (let i = 0; i < 30; i++) {
        const tpl = await createTemplate(user2Id, {
          category: 'document',
          name: `Cap Test ${i}`,
          systemPrompt: 'sys',
          userPrompt: 'usr',
        });
        ids.push(tpl.id);
      }
      await expect(async () =>
        await createTemplate(user2Id, {
          category: 'document',
          name: 'Over Limit',
          systemPrompt: 'sys',
          userPrompt: 'usr',
        }),
      ).rejects.toThrow(/Maximum/);
    });
  });

  describe('active template assignment', () => {
    let tplId: string;

    beforeAll(async () => {
      const tpl = await createTemplate(userId, {
        category: 'payload',
        name: 'Active Test Payload',
        systemPrompt: 'My custom payload system',
        userPrompt: 'My custom payload user {{PAYLOAD_COUNT}}',
      });
      tplId = tpl.id;
    });

    afterAll(async () => {
      await clearActiveTemplate(userId, 'payload');
      try { await deleteTemplate(userId, tplId); } catch { /* ok */ }
    });

    it('should assign active template', async () => {
      await setActiveTemplate(userId, 'payload', tplId);
      const actives = await getActiveTemplates(userId);
      expect(actives.payload).toBe(tplId);
    });

    it('should reject category mismatch', async () => {
      await expect(async () => await setActiveTemplate(userId, 'document', tplId)).rejects.toThrow(/category mismatch/);
    });

    it('should clear active template', async () => {
      await clearActiveTemplate(userId, 'payload');
      const actives = await getActiveTemplates(userId);
      expect(actives.payload).toBeUndefined();
    });
  });

  describe('getUserPrompt', () => {
    let tplId: string;

    beforeAll(async () => {
      const tpl = await createTemplate(userId, {
        category: 'page',
        name: 'Custom Page Prompt',
        systemPrompt: 'CUSTOM PAGE SYSTEM',
        userPrompt: 'CUSTOM PAGE USER {{PAGE_TITLE}}',
      });
      tplId = tpl.id;
    });

    afterAll(async () => {
      await clearActiveTemplate(userId, 'page');
      try { await deleteTemplate(userId, tplId); } catch { /* ok */ }
    });

    it('should return system default when no active template', async () => {
      const sys = await getUserPrompt(userId, 'page', 'system');
      expect(sys).toContain('web page content');
    });

    it('should return user template when active', async () => {
      await setActiveTemplate(userId, 'page', tplId);
      const sys = await getUserPrompt(userId, 'page', 'system');
      expect(sys).toBe('CUSTOM PAGE SYSTEM');
      const usr = await getUserPrompt(userId, 'page', 'user');
      expect(usr).toBe('CUSTOM PAGE USER {{PAGE_TITLE}}');
    });

    it('should revert to default after clear', async () => {
      await clearActiveTemplate(userId, 'page');
      const sys = await getUserPrompt(userId, 'page', 'system');
      expect(sys).not.toBe('CUSTOM PAGE SYSTEM');
    });
  });
});
