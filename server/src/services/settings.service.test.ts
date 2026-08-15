import { describe, it, expect, beforeEach } from 'vitest';
import { setRepos } from '../db/repos';
import { createMockRepositories } from '../db/repositories';
import { isInviteRequired, setInviteRequired, isMaintenanceMode, getMaintenanceMessage, setMaintenanceMode, isMilestoneNotificationsEnabled, setMilestoneNotificationsEnabled } from './settings.service';

describe('settings.service', () => {
  beforeEach(() => {
    setRepos(createMockRepositories());
  });

  describe('isInviteRequired', () => {
    it('defaults to true when no setting exists', async () => {
      expect(await isInviteRequired()).toBe(true);
    });

    it('returns true when setting is "true"', async () => {
      await setInviteRequired(true, 'admin-1');
      expect(await isInviteRequired()).toBe(true);
    });

    it('returns false when setting is "false"', async () => {
      await setInviteRequired(false, 'admin-1');
      expect(await isInviteRequired()).toBe(false);
    });
  });

  describe('setInviteRequired', () => {
    it('persists the setting', async () => {
      await setInviteRequired(false, 'admin-1');
      expect(await isInviteRequired()).toBe(false);

      await setInviteRequired(true, 'admin-2');
      expect(await isInviteRequired()).toBe(true);
    });

    it('stores updatedBy and updatedAt', async () => {
      const before = new Date().toISOString();
      await setInviteRequired(false, 'admin-x');

      // Read back via the repo directly
      const { getRepos } = await import('../db/repos');
      const doc = await getRepos().config.getSiteSetting('site:require_invite_code');
      expect(doc).toBeDefined();
      expect(doc!.value).toBe('false');
      expect(doc!.updatedBy).toBe('admin-x');
      expect(doc!.updatedAt >= before).toBe(true);
    });
  });

  describe('isMaintenanceMode', () => {
    it('defaults to false when no setting exists', async () => {
      expect(await isMaintenanceMode()).toBe(false);
    });

    it('returns true when enabled', async () => {
      await setMaintenanceMode(true, 'admin-1');
      expect(await isMaintenanceMode()).toBe(true);
    });

    it('returns false when disabled', async () => {
      await setMaintenanceMode(true, 'admin-1');
      await setMaintenanceMode(false, 'admin-1');
      expect(await isMaintenanceMode()).toBe(false);
    });
  });

  describe('getMaintenanceMessage', () => {
    it('returns empty string when no message set', async () => {
      expect(await getMaintenanceMessage()).toBe('');
    });

    it('returns the custom message', async () => {
      await setMaintenanceMode(true, 'admin-1', 'Upgrading database');
      expect(await getMaintenanceMessage()).toBe('Upgrading database');
    });
  });

  describe('setMaintenanceMode', () => {
    it('stores maintenance mode and message together', async () => {
      await setMaintenanceMode(true, 'admin-1', 'Brief downtime');
      expect(await isMaintenanceMode()).toBe(true);
      expect(await getMaintenanceMessage()).toBe('Brief downtime');
    });

    it('clears message when disabled without message', async () => {
      await setMaintenanceMode(true, 'admin-1', 'Upgrading');
      await setMaintenanceMode(false, 'admin-1');
      expect(await isMaintenanceMode()).toBe(false);
      expect(await getMaintenanceMessage()).toBe('');
    });
  });

  describe('isMilestoneNotificationsEnabled', () => {
    it('defaults to true when no setting exists', async () => {
      expect(await isMilestoneNotificationsEnabled()).toBe(true);
    });

    it('returns true when setting is "true"', async () => {
      await setMilestoneNotificationsEnabled(true, 'admin-1');
      expect(await isMilestoneNotificationsEnabled()).toBe(true);
    });

    it('returns false when setting is "false"', async () => {
      await setMilestoneNotificationsEnabled(false, 'admin-1');
      expect(await isMilestoneNotificationsEnabled()).toBe(false);
    });
  });

  describe('setMilestoneNotificationsEnabled', () => {
    it('persists the setting', async () => {
      await setMilestoneNotificationsEnabled(false, 'admin-1');
      expect(await isMilestoneNotificationsEnabled()).toBe(false);

      await setMilestoneNotificationsEnabled(true, 'admin-2');
      expect(await isMilestoneNotificationsEnabled()).toBe(true);
    });

    it('stores updatedBy and updatedAt', async () => {
      const before = new Date().toISOString();
      await setMilestoneNotificationsEnabled(false, 'admin-x');

      const { getRepos } = await import('../db/repos');
      const doc = await getRepos().config.getSiteSetting('site:milestone_notifications');
      expect(doc).toBeDefined();
      expect(doc!.value).toBe('false');
      expect(doc!.updatedBy).toBe('admin-x');
      expect(doc!.updatedAt >= before).toBe(true);
    });
  });
});
