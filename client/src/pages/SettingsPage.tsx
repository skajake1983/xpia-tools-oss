import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useThemeContext } from '../context/ThemeContext';
import { useLocalMode } from '../hooks/useLocalMode';
import { api } from '../lib/api';
import { Shield, ShieldCheck, ShieldOff, Key, Plus, Trash2, Check, Loader2, Sun, Moon, Monitor, User, Linkedin, Star, AlertTriangle, Lock, Eye, EyeOff, X, ExternalLink } from 'lucide-react';

const PROVIDER_KEY_URLS: Record<string, { label: string; url: string }> = {
  openai: { label: 'OpenAI', url: 'https://platform.openai.com/api-keys' },
  google: { label: 'Google AI Studio', url: 'https://aistudio.google.com/apikey' },
  xai: { label: 'xAI', url: 'https://console.x.ai/' },
};
import { PASSWORD_RULES } from '../../../shared/password-rules';

interface UserKey {
  id: string;
  provider_id: string;
  key_label: string;
  is_active: number;
  created_at: string;
  provider_name: string;
  provider_is_enabled: number;
}

interface KeyProvider {
  id: string;
  name: string;
  display_name: string;
  is_enabled: number;
}

function ChangePasswordSection() {
  const { refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const allRulesMet = PASSWORD_RULES.every((r) => r.test(newPassword));
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmit = currentPassword.length > 0 && allRulesMet && passwordsMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      await refreshUser();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password changed successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card mt-6">
      <div className="flex items-center gap-3 mb-4">
        <Lock className="w-5 h-5 text-brand-600" />
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Change Password</h3>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400 rounded-lg px-3 py-2 mb-4 flex items-center gap-2"><X className="w-4 h-4 flex-shrink-0" />{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 dark:bg-green-950/50 dark:text-green-400 rounded-lg px-3 py-2 mb-4 flex items-center gap-2"><Check className="w-4 h-4 flex-shrink-0" />{success}</p>}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <div>
          <label className="label">Current Password</label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              className="input pr-10"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="label">New Password</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              className="input pr-10"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {newPassword.length > 0 && (
            <ul className="mt-2 space-y-1">
              {PASSWORD_RULES.map((rule) => {
                const passed = rule.test(newPassword);
                return (
                  <li key={rule.id} className={`flex items-center gap-1.5 text-xs ${passed ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                    {passed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <label className="label">Confirm New Password</label>
          <input
            type="password"
            className="input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
          )}
        </div>

        <button type="submit" className="btn-primary text-sm" disabled={!canSubmit}>
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Changing…</> : <><Lock className="w-4 h-4" /> Change Password</>}
        </button>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const isLocal = useLocalMode();
  const { theme, setTheme } = useThemeContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  const [profileOrg, setProfileOrg] = useState('');
  const [profileTitle, setProfileTitle] = useState('');
  const [profileLinkedin, setProfileLinkedin] = useState('');

  // 2FA setup
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState('');

  // API Keys
  const [userKeys, setUserKeys] = useState<UserKey[]>([]);
  const [keyProviders, setKeyProviders] = useState<KeyProvider[]>([]);
  const [addProvider, setAddProvider] = useState('');
  const [addKeyValue, setAddKeyValue] = useState('');
  const [addKeyLabel, setAddKeyLabel] = useState('');
  const [addKeyEndpoint, setAddKeyEndpoint] = useState('');
  const [addKeyApiVersion, setAddKeyApiVersion] = useState('');
  const [addingKey, setAddingKey] = useState(false);
  const [keysLoading, setKeysLoading] = useState(true);

  // Account Deletion
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileFirstName(user.firstName ?? '');
      setProfileLastName(user.lastName ?? '');
      setProfileOrg(user.organization ?? '');
      setProfileTitle(user.jobTitle ?? '');
      setProfileLinkedin(user.linkedinUrl ?? '');
    }
  }, [user]);

  const loadKeys = useCallback(async () => {
    try {
      const [{ keys }, { providers }] = await Promise.all([
        api.keys.list(),
        api.keys.getProviders(),
      ]);
      setUserKeys(keys);
      setKeyProviders(providers);
      const configuredIds = new Set(keys.map((k: UserKey) => k.provider_id));
      const available = providers.filter((p: KeyProvider) => !configuredIds.has(p.id));
      if (available.length) setAddProvider(available[0].id);
      else setAddProvider('');
    } catch {
      // silently fail on initial load
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const configuredProviderIds = new Set(userKeys.map(k => k.provider_id));
  const availableProviders = keyProviders.filter(p => !configuredProviderIds.has(p.id));
  const isAzureKeyProvider = keyProviders.find((p) => p.id === addProvider)?.name === 'azure-openai';

  const handleSaveProfile = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.auth.updateProfile({
        firstName: profileFirstName,
        lastName: profileLastName,
        organization: profileOrg,
        jobTitle: profileTitle,
        linkedinUrl: profileLinkedin,
      });
      setSuccess('Profile updated');
      setEditingProfile(false);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = async () => {
    if (!addKeyValue.trim()) return;
    setAddingKey(true);
    setError('');
    try {
      await api.keys.add(addProvider, addKeyValue, addKeyLabel || undefined, {
        endpoint: addKeyEndpoint.trim() || undefined,
        apiVersion: addKeyApiVersion.trim() || undefined,
      });
      setAddKeyValue('');
      setAddKeyLabel('');
      setAddKeyEndpoint('');
      setAddKeyApiVersion('');
      setSuccess('API key added successfully');
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add key');
    } finally {
      setAddingKey(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    setError('');
    try {
      await api.keys.delete(id);
      setSuccess('API key removed');
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete key');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmEmail !== user?.email) return;
    setError('');
    setDeleting(true);
    try {
      await api.auth.deleteAccount(deletePassword);
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const handleSetup2FA = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const data = await api.auth.setup2FA();
      setSetupData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm2FA = async () => {
    setError('');
    setLoading(true);
    try {
      await api.auth.confirm2FA(confirmCode);
      setSetupData(null);
      setConfirmCode('');
      setSuccess(user?.totpEnabled ? 'Authenticator app switched successfully' : 'Two-factor authentication enabled successfully');
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your account and security settings</p>
      </div>

      {/* Account / Profile info — hidden in the local single-user build (no accounts) */}
      {!isLocal && (
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-brand-600" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Profile</h3>
          </div>
          {!editingProfile && (
            <button onClick={() => setEditingProfile(true)} className="text-xs text-brand-600 hover:text-brand-500 font-medium">
              Edit
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400 rounded-lg px-3 py-2 mb-4">{error}</p>}
        {success && <p className="text-sm text-green-600 bg-green-50 dark:bg-green-950/50 dark:text-green-400 rounded-lg px-3 py-2 mb-4">{success}</p>}

        {editingProfile ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">First Name</label>
                <input className="input" value={profileFirstName} onChange={(e) => setProfileFirstName(e.target.value)} />
              </div>
              <div>
                <label className="label">Last Name</label>
                <input className="input" value={profileLastName} onChange={(e) => setProfileLastName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Organization</label>
              <input className="input" value={profileOrg} onChange={(e) => setProfileOrg(e.target.value)} />
            </div>
            <div>
              <label className="label">Job Title</label>
              <input className="input" value={profileTitle} onChange={(e) => setProfileTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">LinkedIn URL</label>
              <input className="input" value={profileLinkedin} onChange={(e) => setProfileLinkedin(e.target.value)} placeholder="https://linkedin.com/in/yourname" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSaveProfile} className="btn-primary text-sm" disabled={loading}>
                {loading ? 'Saving…' : 'Save Profile'}
              </button>
              <button onClick={() => setEditingProfile(false)} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-500 dark:text-gray-400">Name</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.firstName} {user?.lastName}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-500 dark:text-gray-400">Email</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-500 dark:text-gray-400">Organization</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.organization || '—'}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-500 dark:text-gray-400">Job Title</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.jobTitle || '—'}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-500 dark:text-gray-400">LinkedIn</span>
              {user?.linkedinUrl ? (
                <a href={user.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 hover:text-brand-500 flex items-center gap-1">
                  <Linkedin className="w-3.5 h-3.5" /> Profile
                </a>
              ) : (
                <span className="text-sm text-gray-400 dark:text-gray-500 italic">Not set — edit profile to add</span>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* In local mode the Profile/2FA cards (which host the shared status banner) are hidden —
          surface API-key add/remove feedback here instead. */}
      {isLocal && (error || success) && (
        <div className="mb-6 space-y-2">
          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400 rounded-lg px-3 py-2">{error}</p>}
          {success && <p className="text-sm text-green-600 bg-green-50 dark:bg-green-950/50 dark:text-green-400 rounded-lg px-3 py-2">{success}</p>}
        </div>
      )}

      {/* Appearance */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Sun className="w-5 h-5 text-brand-600" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Appearance</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose your preferred theme</p>
        <div className="flex gap-2">
          {([
            { value: 'light' as const, icon: Sun, label: 'Light' },
            { value: 'dark' as const, icon: Moon, label: 'Dark' },
            { value: 'system' as const, icon: Monitor, label: 'System' },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                theme === opt.value
                  ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-950 dark:text-brand-300 dark:ring-brand-800'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              <opt.icon className="w-4 h-4" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2FA settings — hidden in the local single-user build (no login/accounts) */}
      {!isLocal && (
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-brand-600" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Two-Factor Authentication</h3>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400 rounded-lg px-3 py-2 mb-4">{error}</p>}
        {success && <p className="text-sm text-green-600 bg-green-50 dark:bg-green-950/50 dark:text-green-400 rounded-lg px-3 py-2 mb-4">{success}</p>}

        {user?.totpEnabled ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">2FA is enabled</span>
            </div>

            {!setupData && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  Switching devices? Set up a new authenticator app below. Your old app will stop working once the new one is verified.
                </p>
                <button
                  onClick={handleSetup2FA}
                  className="btn-secondary text-sm"
                  disabled={loading}
                >
                  <Shield className="w-4 h-4" />
                  {loading ? 'Setting up…' : 'Switch Authenticator App'}
                </button>
              </div>
            )}
          </div>
        ) : setupData ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Scan this QR code with your authenticator app:</p>
            <div className="flex justify-center">
              <img src={setupData.qrCodeUrl} alt="2FA QR Code" className="rounded-xl shadow-sm" />
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">Or enter this secret manually:</p>
              <code className="text-sm font-mono bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg text-brand-700 dark:text-brand-400 select-all">
                {setupData.secret}
              </code>
            </div>
            <div>
              <label className="label">Verification Code</label>
              <input
                type="text"
                className="input !w-48 text-center font-mono text-lg tracking-widest"
                placeholder="000000"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleConfirm2FA}
                className="btn-primary text-sm"
                disabled={loading || confirmCode.length !== 6}
              >
                {loading ? 'Verifying…' : 'Verify & Enable'}
              </button>
              <button
                onClick={() => { setSetupData(null); setConfirmCode(''); }}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-gray-400">2FA is not enabled</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Add an extra layer of security with time-based one-time passwords (TOTP).
            </p>
            <button onClick={handleSetup2FA} className="btn-primary text-sm" disabled={loading}>
              <ShieldCheck className="w-4 h-4" />
              {loading ? 'Setting up…' : 'Enable 2FA'}
            </button>
          </div>
        )}
      </div>
      )}

      {/* Change Password — hidden in the local single-user build (no login/accounts) */}
      {!isLocal && <ChangePasswordSection />}

      {/* API Keys */}
      <div className="card mt-6">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-brand-600" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">API Keys</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Add your own API keys for each LLM provider. Only models for providers where you have an active key will be available to you.
        </p>

        {/* Model ranking for security research */}
        <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-2.5">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-yellow-500" /> Provider Ranking for Security Research
          </p>
          {([
            { name: 'xAI (Grok)', rating: 'Lowest refusal rate' },
            { name: 'Google (Gemini)', rating: 'Very cooperative' },
            { name: 'OpenAI (ChatGPT, mini & nano)', rating: 'Generally cooperative' },
          ] as const).map((p, i) => (
            <div key={p.name} className="flex items-center gap-2.5 text-xs">
              <span className="w-4 text-right font-mono text-gray-400">{i + 1}.</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
              <span className="text-gray-400 ml-auto">{p.rating}</span>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 pt-1">
            See <a href="/app/roe" className="text-brand-600 hover:text-brand-500 underline">Rules of Engagement</a> for detailed provider policies.
          </p>
        </div>

        {keysLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Configured keys */}
            {userKeys.length > 0 && (
              <div className="mb-5 space-y-2">
                {userKeys.map((k) => {
                  const providerDisabled = !k.provider_is_enabled;
                  return (
                  <div key={k.id} className={`flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl ${providerDisabled ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-3">
                      {providerDisabled ? (
                        <ShieldOff className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {k.provider_name}
                          {providerDisabled && (
                            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                              Provider Disabled
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          {k.key_label}{k.key_label ? ' · ' : ''}Added {new Date(k.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteKey(k.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remove key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  );
                })}
              </div>
            )}

            {/* Add key form */}
            {availableProviders.length > 0 ? (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add a key
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    className="select"
                    value={addProvider}
                    onChange={(e) => setAddProvider(e.target.value)}
                  >
                    {availableProviders.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="input"
                    placeholder="Label (optional)"
                    value={addKeyLabel}
                    onChange={(e) => setAddKeyLabel(e.target.value)}
                  />
                </div>
                {isAzureKeyProvider && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      className="input"
                      placeholder="Resource endpoint (https://….openai.azure.com)"
                      value={addKeyEndpoint}
                      onChange={(e) => setAddKeyEndpoint(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input"
                      placeholder="API version (optional, e.g. 2024-10-21)"
                      value={addKeyApiVersion}
                      onChange={(e) => setAddKeyApiVersion(e.target.value)}
                    />
                  </div>
                )}
                {isAzureKeyProvider && (
                  <p className="text-xs text-gray-400">
                    Azure OpenAI: enter your resource endpoint here; add each model on the Models tab with its <strong>deployment name</strong> as the model ID.
                  </p>
                )}
                {PROVIDER_KEY_URLS[addProvider] && (
                  <a
                    href={PROVIDER_KEY_URLS[addProvider].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-500 transition-colors"
                  >
                    Don&apos;t have a key? Get one from {PROVIDER_KEY_URLS[addProvider].label}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <input
                  type="password"
                  className="input w-full"
                  placeholder="Paste your API key (e.g., sk-...)"
                  value={addKeyValue}
                  onChange={(e) => setAddKeyValue(e.target.value)}
                />
                <button
                  onClick={handleAddKey}
                  className="btn-primary text-sm"
                  disabled={addingKey || !addKeyValue.trim() || (isAzureKeyProvider && !addKeyEndpoint.trim())}
                >
                  {addingKey ? 'Adding…' : 'Add Key'}
                </button>
                <p className="text-xs text-gray-400">
                  Keys are encrypted at rest.
                </p>
              </div>
            ) : keyProviders.length > 0 ? (
              <p className="text-sm text-gray-400">All providers are configured. Remove a key above to reconfigure.</p>
            ) : (
              <p className="text-sm text-gray-400">No providers are enabled. Contact an admin to enable LLM providers.</p>
            )}
          </>
        )}
      </div>

      {/* Danger Zone — hidden in the local single-user build (no account to delete) */}
      {!isLocal && (
      <div className="card mt-6 border-red-200 dark:border-red-900/50">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h3 className="text-base font-semibold text-red-600 dark:text-red-400">Danger Zone</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-danger text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Delete My Account
          </button>
        ) : (
          <div className="space-y-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              This will permanently delete your account, all generated documents, payloads, pages, API keys, and usage history.
            </p>
            <div>
              <label className="label text-red-700 dark:text-red-400">
                Type your email to confirm: <span className="font-mono">{user?.email}</span>
              </label>
              <input
                type="text"
                className="input"
                placeholder={user?.email}
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label text-red-700 dark:text-red-400">Enter your password</label>
              <input
                type="password"
                className="input"
                placeholder="Your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAccount}
                className="btn-danger text-sm"
                disabled={deleting || deleteConfirmEmail !== user?.email || !deletePassword}
              >
                {deleting ? 'Deleting…' : 'Permanently Delete Account'}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteConfirmEmail(''); }}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
