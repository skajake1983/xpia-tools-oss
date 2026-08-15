import repos from '../db/repos';

const REQUIRE_INVITE_KEY = 'site:require_invite_code';
const MAINTENANCE_MODE_KEY = 'site:maintenance_mode';
const MAINTENANCE_MSG_KEY = 'site:maintenance_message';
const MAINTENANCE_ENDS_AT_KEY = 'site:maintenance_ends_at';

export async function isInviteRequired(): Promise<boolean> {
  const setting = await repos.config.getSiteSetting(REQUIRE_INVITE_KEY);
  // Default to true — invite codes required unless explicitly disabled
  if (!setting) return true;
  return setting.value === 'true';
}

export async function setInviteRequired(required: boolean, updatedBy: string): Promise<void> {
  await repos.config.upsertSiteSetting({
    id: REQUIRE_INVITE_KEY,
    type: 'site_setting',
    value: String(required),
    updatedBy,
    updatedAt: new Date().toISOString(),
  });
}

export async function isMaintenanceMode(): Promise<boolean> {
  const setting = await repos.config.getSiteSetting(MAINTENANCE_MODE_KEY);
  if (!setting) return false;
  return setting.value === 'true';
}

export async function getMaintenanceMessage(): Promise<string> {
  const setting = await repos.config.getSiteSetting(MAINTENANCE_MSG_KEY);
  return setting?.value || '';
}

export async function getMaintenanceEndsAt(): Promise<string> {
  const setting = await repos.config.getSiteSetting(MAINTENANCE_ENDS_AT_KEY);
  return setting?.value || '';
}

export async function setMaintenanceMode(enabled: boolean, updatedBy: string, message?: string, endsAt?: string): Promise<void> {
  const now = new Date().toISOString();
  await repos.config.upsertSiteSetting({
    id: MAINTENANCE_MODE_KEY,
    type: 'site_setting',
    value: String(enabled),
    updatedBy,
    updatedAt: now,
  });
  // Always update message: use provided message, or clear it when disabling
  const effectiveMessage = message ?? (enabled ? '' : '');
  await repos.config.upsertSiteSetting({
    id: MAINTENANCE_MSG_KEY,
    type: 'site_setting',
    value: effectiveMessage,
    updatedBy,
    updatedAt: now,
  });
  // Store optional auto-expire timestamp
  await repos.config.upsertSiteSetting({
    id: MAINTENANCE_ENDS_AT_KEY,
    type: 'site_setting',
    value: enabled ? (endsAt || '') : '',
    updatedBy,
    updatedAt: now,
  });
}

const MILESTONE_NOTIFICATIONS_KEY = 'site:milestone_notifications';

export async function isMilestoneNotificationsEnabled(): Promise<boolean> {
  const setting = await repos.config.getSiteSetting(MILESTONE_NOTIFICATIONS_KEY);
  // Default to true — notifications enabled unless explicitly disabled
  if (!setting) return true;
  return setting.value === 'true';
}

export async function setMilestoneNotificationsEnabled(enabled: boolean, updatedBy: string): Promise<void> {
  await repos.config.upsertSiteSetting({
    id: MILESTONE_NOTIFICATIONS_KEY,
    type: 'site_setting',
    value: String(enabled),
    updatedBy,
    updatedAt: new Date().toISOString(),
  });
}

/** Auto-disable maintenance if endsAt has passed. Returns true if still in maintenance. */
export async function checkAndExpireMaintenance(): Promise<boolean> {
  const enabled = await isMaintenanceMode();
  if (!enabled) return false;
  const endsAt = await getMaintenanceEndsAt();
  if (!endsAt) return true;
  if (new Date(endsAt).getTime() <= Date.now()) {
    await setMaintenanceMode(false, 'system:auto-expire');
    return false;
  }
  return true;
}
