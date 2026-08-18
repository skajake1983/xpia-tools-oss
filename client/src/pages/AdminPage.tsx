import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Shield, Users, Cpu, ToggleLeft, ToggleRight, Search, UserPlus, Check, X, Ticket, Copy, Plus, Trash2, Clock, Pencil, Loader2, FileText, RotateCcw, BarChart3, AlertTriangle, Construction, ClipboardList, ChevronLeft, ChevronRight, Download, Bell } from 'lucide-react';
import { useLocalMode } from '../hooks/useLocalMode';
import HelpTip from '../components/HelpTip';
import ConfirmModal from '../components/ConfirmModal';

interface Provider {
  id: string;
  name: string;
  display_name: string;
  is_enabled: number;
}

interface CatalogEntry {
  key: string;
  display_name: string;
  base_url: string;
  note: string | null;
  installed: boolean;
  models: { model_id: string; display_name: string }[];
}

interface Model {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  input_price_per_million: number;
  output_price_per_million: number;
  max_context_tokens: number;
  max_output_tokens: number;
  is_enabled: number;
  provider_name: string;
}

interface AdminUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  organization: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  is_admin: number;
  is_superadmin: number;
  totp_enabled: number;
  can_generate_invites: number;
  created_at: string;
  daily_token_limit: number | null;
  is_suspended: number | null;
}

interface InviteRequest {
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

interface InviteCode {
  id: string;
  code: string;
  creator_email: string;
  max_uses: number;
  use_count: number;
  note: string | null;
  invited_email: string | null;
  invited_first_name: string | null;
  invited_last_name: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface PromptConfig {
  key: string;
  category: string;
  label: string;
  description: string;
  defaultValue: string;
  currentValue: string;
  isOverridden: boolean;
}

interface MonthlySnapshot {
  tokensIn: number;
  tokensOut: number;
  documents: number;
  images: number;
  qrCodes: number;
  payloads: number;
  webPages: number;
  customActions: number;
  newUsers: number;
  activeUserIds: string[];
}

interface PlatformMetrics {
  totalPages: number;
  totalDocuments: number;
  documentsByType: Record<string, number>;
  totalPayloads: number;
  payloadsByFormat: Record<string, number>;
  totalTokensIn: number;
  totalTokensOut: number;
  totalQrCodes: number;
  totalImages: number;
  totalCustomActions: number;
  monthly: Record<string, MonthlySnapshot>;
  updatedAt: string;
}

type Tab = 'requests' | 'users' | 'invites' | 'providers' | 'models' | 'usage' | 'prompts' | 'audit';

// Multi-user / cloud tabs hidden in the single-user desktop build.
const LOCAL_HIDDEN_TABS: Tab[] = ['requests', 'users', 'invites', 'usage'];

export default function AdminPage() {
  const { user } = useAuth();
  const isLocal = useLocalMode();
  const [tab, setTab] = useState<Tab>('requests');
  useEffect(() => {
    if (isLocal && LOCAL_HIDDEN_TABS.includes(tab)) setTab('providers');
  }, [isLocal]); // eslint-disable-line react-hooks/exhaustive-deps
  const [providers, setProviders] = useState<Provider[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [installingKey, setInstallingKey] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AdminUser[] | null>(null);
  const [requests, setRequests] = useState<InviteRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState<'pending' | 'approved' | 'rejected' | ''>('pending');
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [editingPromptKey, setEditingPromptKey] = useState<string | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Delete user confirmation
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');

  // Invite code creation
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteExpiry, setInviteExpiry] = useState(168);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState('');
  const [inviteRequired, setInviteRequired] = useState(true);
  const [inviteToggleLoading, setInviteToggleLoading] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [maintenanceEndsAt, setMaintenanceEndsAt] = useState('');
  const [maintenanceDuration, setMaintenanceDuration] = useState<'30' | '60' | '90' | '120' | 'custom' | ''>('30');
  const [maintenanceCustomEnd, setMaintenanceCustomEnd] = useState('');
  const [maintenanceToggleLoading, setMaintenanceToggleLoading] = useState(false);
  const [milestoneNotifications, setMilestoneNotifications] = useState(true);
  const [milestoneToggleLoading, setMilestoneToggleLoading] = useState(false);

  // Model form state
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [modelForm, setModelForm] = useState({
    providerId: '',
    modelId: '',
    displayName: '',
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
  });
  const [modelSaving, setModelSaving] = useState(false);
  const [deleteModelTarget, setDeleteModelTarget] = useState<Model | null>(null);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<{ id: string; action: string; actorEmail: string; targetType: string; targetLabel: string; detail: string; createdAt: string }[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditSearchInput, setAuditSearchInput] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [tab, requestFilter, auditPage, auditSearch]);

  const loadData = async () => {
    setError('');
    try {
      if (tab === 'requests') {
        const { requests: r } = await api.inviteRequests.list(requestFilter || undefined);
        setRequests(r);
      } else if (tab === 'providers') {
        const [providersRes, catalogRes] = await Promise.all([
          api.admin.getProviders(),
          api.admin.getIntegrationCatalog(),
        ]);
        setProviders(providersRes.providers);
        setCatalog(catalogRes.catalog);
      } else if (tab === 'models') {
        const [modelsRes, providersRes] = await Promise.all([
          api.admin.getModels(),
          api.admin.getProviders(),
        ]);
        setModels(modelsRes.models);
        setProviders(providersRes.providers);
      } else if (tab === 'users') {
        const { users } = await api.admin.getUsers();
        setUsers(users);
      } else if (tab === 'invites') {
        const [codesRes, settingsRes] = await Promise.all([
          api.invites.list(),
          api.admin.getSettings(),
        ]);
        setInviteCodes(codesRes.codes);
        setInviteRequired(settingsRes.requireInviteCode);
        setMaintenanceMode(settingsRes.maintenanceMode);
        setMaintenanceMessage(settingsRes.maintenanceMessage || '');
        setMaintenanceEndsAt(settingsRes.maintenanceEndsAt || '');
        setMilestoneNotifications(settingsRes.milestoneNotifications);
      } else if (tab === 'usage') {
        const { metrics, totalUsers: tu } = await api.admin.getMetrics();
        setPlatformMetrics(metrics);
        setTotalUsers(tu);
      } else if (tab === 'prompts') {
        const { prompts: p } = await api.admin.getPrompts();
        setPrompts(p);
      } else if (tab === 'audit') {
        setAuditLoading(true);
        try {
          const result = await api.admin.getAuditLog({ search: auditSearch || undefined, page: auditPage });
          setAuditLogs(result.logs);
          setAuditTotal(result.total);
        } finally {
          setAuditLoading(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const { users } = await api.admin.searchUsers(searchQuery.trim());
      setSearchResults(users);
    } catch {
      setSearchResults([]);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timeout = setTimeout(handleSearch, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, handleSearch]);

  const toggleProvider = async (id: string) => {
    await api.admin.toggleProvider(id);
    loadData();
  };

  const addIntegration = async (key: string) => {
    setError('');
    setSuccess('');
    setInstallingKey(key);
    try {
      const res = await api.admin.addIntegration(key);
      const modelNote = res.models.length
        ? ` with ${res.models.length} model${res.models.length === 1 ? '' : 's'}`
        : '';
      setSuccess(
        `Added ${res.provider.display_name}${modelNote}. Add an API key in Settings, then set prices on the Models tab.` +
          (res.note ? ` ${res.note}` : ''),
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add integration');
    } finally {
      setInstallingKey(null);
    }
  };

  const toggleModel = async (id: string, currentlyEnabled: number, providerId: string) => {
    if (!currentlyEnabled) {
      const provider = providers.find((p) => p.id === providerId);
      if (provider && !provider.is_enabled) {
        setError(`Cannot enable model — provider "${provider.display_name}" is disabled. Enable the provider first.`);
        return;
      }
    }
    await api.admin.updateModel(id, { isEnabled: !currentlyEnabled });
    loadData();
  };

  const resetModelForm = () => {
    setShowModelForm(false);
    setEditingModel(null);
    setModelForm({ providerId: '', modelId: '', displayName: '', inputPricePerMillion: 0, outputPricePerMillion: 0, maxContextTokens: 128000, maxOutputTokens: 4096 });
  };

  const startEditModel = (m: Model) => {
    setEditingModel(m);
    setModelForm({
      providerId: m.provider_id,
      modelId: m.model_id,
      displayName: m.display_name,
      inputPricePerMillion: m.input_price_per_million,
      outputPricePerMillion: m.output_price_per_million,
      maxContextTokens: m.max_context_tokens,
      maxOutputTokens: m.max_output_tokens,
    });
    setShowModelForm(true);
  };

  const handleModelSubmit = async () => {
    setError('');
    setModelSaving(true);
    try {
      if (editingModel) {
        await api.admin.updateModel(editingModel.id, {
          inputPricePerMillion: modelForm.inputPricePerMillion,
          outputPricePerMillion: modelForm.outputPricePerMillion,
          maxOutputTokens: modelForm.maxOutputTokens,
        });
        setSuccess('Model updated');
      } else {
        const result = await api.admin.createModel(modelForm);
        setSuccess(result.warning ? `Model created — ${result.warning}` : 'Model created');
      }
      resetModelForm();
      setTimeout(() => setSuccess(''), 2000);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save model');
    } finally {
      setModelSaving(false);
    }
  };

  const handleDeleteModel = async (m: Model) => {
    setError('');
    try {
      const result = await api.admin.deleteModel(m.id);
      setSuccess(result.message);
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const updateUserLimits = async (userId: string, updates: Record<string, unknown>) => {
    setError('');
    try {
      await api.admin.updateUserLimits(userId, updates as Parameters<typeof api.admin.updateUserLimits>[1]);
      setSuccess('Updated');
      setTimeout(() => setSuccess(''), 2000);
      loadData();
      if (searchResults) handleSearch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const approveRequest = async (id: string) => {
    setError('');
    try {
      const result = await api.inviteRequests.approve(id);
      setSuccess(`Approved! Invite code: ${result.inviteCode}`);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    }
  };

  const rejectRequest = async (id: string) => {
    setError('');
    try {
      await api.inviteRequests.reject(id);
      setSuccess('Request rejected');
      setTimeout(() => setSuccess(''), 2000);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    }
  };

  const handleCreateInvite = async () => {
    setError('');
    if (!inviteEmail || !inviteFirstName || !inviteLastName) {
      setError('All invite fields are required');
      return;
    }
    setCreatingInvite(true);
    try {
      await api.invites.create({ email: inviteEmail, firstName: inviteFirstName.trim(), lastName: inviteLastName.trim(), expiresInHours: inviteExpiry });
      setInviteEmail('');
      setInviteFirstName('');
      setInviteLastName('');
      setSuccess('Invite code created');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleToggleInviteRequired = async () => {
    setInviteToggleLoading(true);
    setError('');
    try {
      const { requireInviteCode } = await api.admin.updateSettings({ requireInviteCode: !inviteRequired });
      setInviteRequired(requireInviteCode);
      setSuccess(requireInviteCode ? 'Invite codes are now required' : 'Open registration enabled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update setting');
    } finally {
      setInviteToggleLoading(false);
    }
  };

  const handleToggleMilestoneNotifications = async () => {
    setMilestoneToggleLoading(true);
    setError('');
    try {
      const { milestoneNotifications: updated } = await api.admin.updateSettings({ milestoneNotifications: !milestoneNotifications });
      setMilestoneNotifications(updated);
      setSuccess(updated ? 'Milestone notifications enabled' : 'Milestone notifications disabled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update setting');
    } finally {
      setMilestoneToggleLoading(false);
    }
  };

  const handleToggleMaintenance = async () => {
    setMaintenanceToggleLoading(true);
    setError('');
    try {
      const enabling = !maintenanceMode;
      let endsAt: string | undefined;
      if (enabling) {
        if (maintenanceDuration === 'custom' && maintenanceCustomEnd) {
          endsAt = new Date(maintenanceCustomEnd).toISOString();
        } else if (maintenanceDuration && maintenanceDuration !== 'custom') {
          endsAt = new Date(Date.now() + parseInt(maintenanceDuration) * 60_000).toISOString();
        }
      }
      const res = await api.admin.updateSettings({
        maintenanceMode: enabling,
        maintenanceMessage: enabling ? maintenanceMessage || undefined : undefined,
        maintenanceEndsAt: enabling ? endsAt : '',
      });
      setMaintenanceMode(res.maintenanceMode);
      setMaintenanceMessage(res.maintenanceMessage || '');
      setMaintenanceEndsAt(res.maintenanceEndsAt || '');
      setSuccess(res.maintenanceMode ? 'Maintenance mode enabled' : 'Maintenance mode disabled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle maintenance mode');
    } finally {
      setMaintenanceToggleLoading(false);
    }
  };

  const handleRevokeInvite = async (id: string) => {
    setError('');
    try {
      await api.invites.revoke(id);
      setSuccess('Invite code revoked');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (deleteConfirmEmail !== email) return;
    setError('');
    try {
      const result = await api.admin.deleteUser(userId);
      setSuccess(result.message);
      setDeletingUserId(null);
      setDeleteConfirmEmail('');
      setTimeout(() => setSuccess(''), 3000);
      loadData();
      if (searchResults) handleSearch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const ALL_TABS: { id: Tab; label: string; icon: typeof Shield }[] = [
    { id: 'requests', label: 'Requests', icon: UserPlus },
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'invites', label: 'Invite Codes', icon: Ticket },
    { id: 'providers', label: 'Providers', icon: Cpu },
    { id: 'models', label: 'Models', icon: Cpu },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
    { id: 'prompts', label: 'Prompts', icon: FileText },
    { id: 'audit', label: 'Audit Log', icon: ClipboardList },
  ];
  const TABS = ALL_TABS.filter((t) => !(isLocal && LOCAL_HIDDEN_TABS.includes(t.id)));

  const renderUserCard = (u: AdminUser) => (
    <div key={u.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email}
          </p>
          {u.first_name && <p className="text-xs text-gray-400">{u.email}</p>}
          {(u.organization || u.job_title) && (
            <p className="text-xs text-gray-400 mt-0.5">
              {u.job_title}{u.job_title && u.organization ? ' at ' : ''}{u.organization}
            </p>
          )}
          {u.linkedin_url && (
            <a href={u.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-500 hover:text-brand-400">
              LinkedIn Profile
            </a>
          )}
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {u.is_superadmin ? <span className="badge badge-critical">SuperAdmin</span>
              : u.is_admin ? <span className="badge badge-critical">Admin</span> : null}
            {u.totp_enabled ? <span className="badge badge-low">2FA</span> : <span className="badge badge-high">No 2FA</span>}
            {u.is_suspended ? <span className="badge badge-high">Suspended</span> : null}
            {u.can_generate_invites && !u.is_admin ? <span className="badge badge-info">Inviter</span> : null}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 items-end">
          {/* Founding SuperAdmin's own card — no action buttons (immutable) */}
          {!(user?.isFounder && u.id === user?.id) && (
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => updateUserLimits(u.id, { isSuspended: !u.is_suspended })}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                u.is_suspended
                  ? 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/50 dark:text-green-400'
                  : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400'
              }`}
            >
              {u.is_suspended ? 'Unsuspend' : 'Suspend'}
            </button>
            {user?.isSuperAdmin && !u.is_superadmin && (
              <button
                onClick={() => updateUserLimits(u.id, { isAdmin: !u.is_admin })}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                {u.is_admin ? 'Remove Admin' : 'Make Admin'}
              </button>
            )}
            <button
              onClick={() => updateUserLimits(u.id, { canGenerateInvites: !u.can_generate_invites })}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              {u.can_generate_invites ? 'Revoke Invite Perm' : 'Grant Invite Perm'}
            </button>
          </div>
          )}
          {!(user?.isFounder && u.id === user?.id) && (
          <div className="flex gap-2 flex-wrap justify-end">
            {/* Only the founding superadmin can grant SuperAdmin to others */}
            {user?.isSuperAdmin && !u.is_superadmin && u.is_admin && (
              <button
                onClick={() => updateUserLimits(u.id, { isSuperAdmin: true })}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-400 transition-colors"
              >
                Promote to SuperAdmin
              </button>
            )}
            {u.id !== user?.id && (
              <button
                onClick={() => { setDeletingUserId(u.id); setDeleteConfirmEmail(''); }}
                className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400 transition-colors"
              >
                <span className="flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</span>
              </button>
            )}
          </div>
          )}
        </div>
      </div>
      {/* Delete confirmation */}
      {deletingUserId === u.id && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
            <AlertTriangle className="w-4 h-4" />
            Permanently delete this user and all their data?
          </div>
          <div>
            <label className="text-xs text-red-600 dark:text-red-400">
              Type <span className="font-mono font-semibold">{u.email}</span> to confirm
            </label>
            <input
              type="text"
              className="input text-sm mt-1"
              placeholder={u.email}
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleDeleteUser(u.id, u.email)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              disabled={deleteConfirmEmail !== u.email}
            >
              Confirm Delete
            </button>
            <button
              onClick={() => { setDeletingUserId(null); setDeleteConfirmEmail(''); }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
          <Shield className="w-6 h-6 text-brand-600" />
          Admin Console
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage requests, users, invites, and providers</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400 rounded-lg px-3 py-2 mb-4">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 dark:bg-green-950/50 dark:text-green-400 rounded-lg px-3 py-2 mb-4">{success}</p>}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-gray-200 dark:border-gray-700 pb-px">
        {TABS.map((t) => (
          <div key={t.id} className="relative flex items-center">
            <button
              onClick={() => { setTab(t.id); setError(''); setSuccess(''); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-white dark:bg-gray-900 text-brand-700 dark:text-brand-400 border border-gray-200 dark:border-gray-700 border-b-white dark:border-b-gray-900 -mb-px'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          </div>
        ))}
      </div>

      {/* Requests Tab */}
      {tab === 'requests' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Invite Requests</h2>
              <HelpTip text="Review and approve or reject user registration requests. Approved users receive invite codes to create their accounts." />
            </div>
            <div className="flex gap-1">
              {(['pending', 'approved', 'rejected', ''] as const).map(f => (
                <button
                  key={f || 'all'}
                  onClick={() => setRequestFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    requestFilter === f
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                >
                  {f ? f.charAt(0).toUpperCase() + f.slice(1) : 'All'}
                </button>
              ))}
            </div>
          </div>
          {requests.length > 0 ? (
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className={`border rounded-xl p-4 ${
                  r.status === 'pending' ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20' :
                  r.status === 'approved' ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20' :
                  'border-gray-200 dark:border-gray-700 opacity-60'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {r.first_name} {r.last_name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{r.email}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {r.job_title} at {r.organization}
                      </p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>
                    {r.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveRequest(r.id)}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/50 dark:text-green-400 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => rejectRequest(r.id)}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    ) : (
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        r.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {r.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No {requestFilter || ''} requests</p>
          )}
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="space-y-6">
          {/* Search */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <Search className="w-5 h-5 text-brand-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Search Users</h2>
              <HelpTip text="Search by name, email, or organization. Results appear as you type." />
            </div>
            <input
              type="text"
              className="input"
              placeholder="Search by name, email, or organization…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchResults && (
              <div className="mt-4 space-y-3">
                {searchResults.length > 0 ? searchResults.map(u => renderUserCard(u)) : (
                  <p className="text-sm text-gray-400 text-center py-4">No users found</p>
                )}
              </div>
            )}
          </div>

          {/* Full user list */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">All Users</h2>
              <HelpTip text="Manage user accounts, roles (SuperAdmin, Admin, User), and suspensions." />
            </div>
            <div className="space-y-4">
              {users.map(u => renderUserCard(u))}
            </div>
          </div>
        </div>
      )}

      {/* Invites Tab */}
      {tab === 'invites' && (
        <div className="space-y-4">
          {/* Maintenance Mode */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Construction className="w-5 h-5 text-amber-600" />
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Maintenance Mode</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {maintenanceMode ? 'Site is in maintenance — only admins can access' : 'Site is live and accessible to all users'}
                  </p>
                </div>
              </div>
              {maintenanceMode && (
                <button
                  onClick={handleToggleMaintenance}
                  disabled={maintenanceToggleLoading}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  {maintenanceToggleLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                  End Maintenance
                </button>
              )}
            </div>

            {maintenanceMode && maintenanceEndsAt && (
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>Scheduled to end: {new Date(maintenanceEndsAt).toLocaleString()}</span>
              </div>
            )}

            {!maintenanceMode && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Duration</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: '30', label: '30 min' },
                      { value: '60', label: '1 hour' },
                      { value: '90', label: '90 min' },
                      { value: '120', label: '2 hours' },
                      { value: 'custom', label: 'Custom' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMaintenanceDuration(opt.value as typeof maintenanceDuration)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                          maintenanceDuration === opt.value
                            ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-600'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {maintenanceDuration === 'custom' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">End Date & Time</label>
                    <input
                      type="datetime-local"
                      value={maintenanceCustomEnd}
                      onChange={e => setMaintenanceCustomEnd(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="input text-sm w-full max-w-xs"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Message (optional)</label>
                  <input
                    type="text"
                    value={maintenanceMessage}
                    onChange={e => setMaintenanceMessage(e.target.value)}
                    placeholder="We'll be back shortly..."
                    className="input text-sm w-full"
                    maxLength={200}
                  />
                </div>

                <button
                  onClick={handleToggleMaintenance}
                  disabled={maintenanceToggleLoading || (maintenanceDuration === 'custom' && !maintenanceCustomEnd)}
                  className="btn-primary text-xs flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 border-amber-600 hover:border-amber-700"
                >
                  {maintenanceToggleLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Construction className="w-3.5 h-3.5" />}
                  Enable Maintenance Mode
                </button>
              </>
            )}
          </div>

          {/* Invite Requirement Toggle */}
          <div className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-brand-600" />
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Require Invite Code</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {inviteRequired ? 'New users must have an invite code to register' : 'Anyone can register without an invite code'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleInviteRequired}
                disabled={inviteToggleLoading}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={inviteRequired ? 'Disable invite requirement' : 'Enable invite requirement'}
              >
                {inviteToggleLoading ? (
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                ) : inviteRequired ? (
                  <ToggleRight className="w-6 h-6 text-green-600" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Milestone Notifications Toggle */}
          <div className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-brand-600" />
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">User Milestone Notifications</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {milestoneNotifications ? 'SuperAdmins receive email at every 50-user milestone' : 'Milestone email notifications are disabled'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleMilestoneNotifications}
                disabled={milestoneToggleLoading}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={milestoneNotifications ? 'Disable milestone notifications' : 'Enable milestone notifications'}
              >
                {milestoneToggleLoading ? (
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                ) : milestoneNotifications ? (
                  <ToggleRight className="w-6 h-6 text-green-600" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          {/* Invite Codes */}
          <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Ticket className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Invite Codes</h2>
              <HelpTip text="Manage active and expired invite codes. Revoke codes to prevent unused ones from being claimed." />
          </div>

          {/* Create form */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-3 mb-5">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Invite Code
              <HelpTip text="Generate a person-bound invite code. Each code is tied to a specific name and email with a configurable expiration." />
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="text" className="input" placeholder="First name" value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} maxLength={100} />
              <input type="text" className="input" placeholder="Last name" value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} maxLength={100} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="email" className="input" placeholder="Email address" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} maxLength={255} />
              <select className="select" value={inviteExpiry} onChange={(e) => setInviteExpiry(Number(e.target.value))}>
                <option value={24}>Expires in 24h</option>
                <option value={168}>Expires in 7 days</option>
                <option value={720}>Expires in 30 days</option>
                <option value={8760}>Expires in 1 year</option>
              </select>
            </div>
            <button onClick={handleCreateInvite} className="btn-primary text-sm" disabled={creatingInvite || !inviteEmail || !inviteFirstName || !inviteLastName}>
              {creatingInvite ? 'Creating…' : 'Generate Code'}
            </button>
          </div>

          {/* List */}
          {inviteCodes.length > 0 ? (
            <div className="space-y-2">
              {inviteCodes.map((ic) => {
                const revoked = !!ic.revoked_at;
                const used = !revoked && ic.use_count >= ic.max_uses;
                const expired = ic.expires_at ? new Date(ic.expires_at) < new Date() : false;
                const inactive = used || expired || revoked;
                return (
                  <div key={ic.id} className={`flex items-center justify-between px-4 py-3 rounded-xl ${inactive ? 'bg-gray-50 dark:bg-gray-800/50 opacity-60' : 'bg-gray-50 dark:bg-gray-800'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{ic.code}</span>
                      <button
                        onClick={() => copyCode(ic.code)}
                        className={`p-1 rounded transition-colors ${inactive ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/50'}`}
                        title="Copy code"
                        disabled={inactive}
                      >
                        {copiedCode === ic.code ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <div className="text-xs text-gray-400 truncate">
                        {ic.invited_first_name} {ic.invited_last_name} ({ic.invited_email})
                        {revoked && <span className="text-red-400 ml-1">revoked</span>}
                        {used && <span className="text-green-500 ml-1">used</span>}
                        {expired && !used && !revoked && <span className="text-red-400 ml-1">(expired)</span>}
                        {ic.expires_at && !expired && !used && !revoked && <span> · Exp {new Date(ic.expires_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {!inactive && (
                      <button
                        onClick={() => handleRevokeInvite(ic.id)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                        title="Revoke"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No invite codes created yet</p>
          )}
        </div>
        </div>
      )}

      {/* Providers Tab */}
      {tab === 'providers' && (
        <div className="space-y-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">LLM Providers</h2>
            <HelpTip text="Enable or disable LLM providers. Disabled providers won't appear in model selectors for users." />
          </div>
          {providers.length === 0 ? (
            <p className="text-sm text-gray-400">No providers yet. Add one from the catalog below.</p>
          ) : (
          <div className="space-y-3">
            {providers.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{p.display_name}</p>
                  <p className="text-xs text-gray-400">{p.name}</p>
                </div>
                <button onClick={() => toggleProvider(p.id)} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
                  {p.is_enabled ? (
                    <ToggleRight className="w-6 h-6 text-green-600" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-gray-400" />
                  )}
                </button>
              </div>
            ))}
          </div>
          )}
        </div>

        {/* Add integration from catalog */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Integration</h2>
            <HelpTip text="Install a provider and its default model(s) from the catalog. After adding, set your API key in Settings and configure prices on the Models tab." />
          </div>
          <div className="space-y-3">
            {catalog.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{c.display_name}</p>
                  <p className="text-xs text-gray-400 truncate">{c.base_url}</p>
                  {c.models.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Includes: {c.models.map((m) => m.display_name).join(', ')}
                    </p>
                  )}
                  {c.note && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{c.note}</p>}
                </div>
                {c.installed ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 whitespace-nowrap">
                    <Check className="w-4 h-4" /> Installed
                  </span>
                ) : (
                  <button
                    onClick={() => addIntegration(c.key)}
                    disabled={installingKey === c.key}
                    className="btn btn-primary inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                  >
                    {installingKey === c.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        </div>
      )}

      {/* Models Tab */}
      {tab === 'models' && (
        <div className="space-y-4">
          {/* Add / Edit Model Form */}
          {showModelForm ? (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {editingModel ? `Edit: ${editingModel.display_name}` : 'Add New Model'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center">Provider<HelpTip text="The LLM provider this model belongs to." /></label>
                  <select
                    className="select w-full"
                    value={modelForm.providerId}
                    onChange={(e) => setModelForm((f) => ({ ...f, providerId: e.target.value }))}
                    disabled={!!editingModel}
                  >
                    <option value="">Select provider…</option>
                    {providers.filter((p) => p.is_enabled).map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center">Model ID<HelpTip text="The API identifier for this model (e.g. gpt-4o, gemini-2.0-flash)." /></label>
                  <input
                    className="input w-full"
                    placeholder="e.g. gpt-5.4"
                    value={modelForm.modelId}
                    onChange={(e) => setModelForm((f) => ({ ...f, modelId: e.target.value }))}
                    disabled={!!editingModel}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center">Display Name<HelpTip text="The friendly name shown to users in model selectors." /></label>
                  <input
                    className="input w-full"
                    placeholder="e.g. GPT-5.4"
                    value={modelForm.displayName}
                    onChange={(e) => setModelForm((f) => ({ ...f, displayName: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  className="btn btn-primary flex items-center gap-2"
                  onClick={handleModelSubmit}
                  disabled={modelSaving || !modelForm.providerId || !modelForm.modelId || !modelForm.displayName}
                >
                  {modelSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editingModel ? 'Save Changes' : 'Add Model'}
                </button>
                <button className="btn btn-secondary" onClick={resetModelForm}>Cancel</button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-primary flex items-center gap-2"
              onClick={() => { resetModelForm(); setShowModelForm(true); loadData(); }}
            >
              <Plus className="w-4 h-4" /> Add Model
            </button>
          )}

          {/* Model Registry Table */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Model Registry</h2>
              <HelpTip text="Configure available LLM models, set pricing per million tokens, and manage context/output limits." />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="pb-3 font-medium">Model</th>
                    <th className="pb-3 font-medium">Provider</th>
                    <th className="pb-3 font-medium text-center">Enabled</th>
                    <th className="pb-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {models.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{m.display_name}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{m.model_id}</div>
                      </td>
                      <td className="py-3 text-gray-500 dark:text-gray-400">{m.provider_name}</td>
                      <td className="py-3 text-center">
                        <button onClick={() => toggleModel(m.id, m.is_enabled, m.provider_id)} className="inline-flex">
                          {m.is_enabled ? (
                            <ToggleRight className="w-5 h-5 text-green-600" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => startEditModel(m)}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                            title="Edit model"
                          >
                            <Pencil className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                          <button
                            onClick={() => setDeleteModelTarget(m)}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                            title="Delete model"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Usage Tab */}
      {tab === 'usage' && platformMetrics && <MetricsDashboard metrics={platformMetrics} totalUsers={totalUsers} />}

      {/* Prompts Tab */}
      {tab === 'prompts' && (
        <div className="space-y-6">
          {(() => {
            const categories = [...new Set(prompts.map(p => p.category))];
            return categories.map(cat => (
              <div key={cat} className="card">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{cat}</h2>
                <div className="space-y-4">
                  {prompts.filter(p => p.category === cat).map(p => (
                    <div key={p.key} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100 text-sm inline-flex items-center">
                            {p.label}
                            <HelpTip text={p.description} />
                            {p.isOverridden && (
                              <span className="ml-2 text-xs bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-1.5 py-0.5 rounded-md">Customized</span>
                            )}
                          </p>
                          <p className="text-[10px] font-mono text-gray-400 mt-0.5">{p.key}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {(!editingPromptKey || editingPromptKey === p.key) && (
                          <button
                            onClick={() => {
                              setEditingPromptKey(p.key);
                              setEditingPromptValue(p.currentValue);
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          )}
                          {p.isOverridden && !editingPromptKey && (
                            <button
                              onClick={async () => {
                                try {
                                  await api.admin.resetPrompt(p.key);
                                  setSuccess('Prompt reset to default');
                                  loadData();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Failed to reset');
                                }
                              }}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-400 dark:hover:bg-orange-950 transition-colors"
                              title="Reset to default"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {editingPromptKey === p.key ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingPromptValue}
                            onChange={e => setEditingPromptValue(e.target.value)}
                            rows={Math.min(Math.max(editingPromptValue.split('\n').length + 1, 4), 16)}
                            className="w-full text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y"
                          />
                          <div className="flex gap-2">
                            <button
                              disabled={promptSaving}
                              onClick={async () => {
                                setPromptSaving(true);
                                try {
                                  await api.admin.updatePrompt(p.key, editingPromptValue);
                                  setEditingPromptKey(null);
                                  setSuccess('Prompt saved');
                                  loadData();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Failed to save');
                                } finally {
                                  setPromptSaving(false);
                                }
                              }}
                              className="text-xs px-4 py-1.5 rounded-lg font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                            >
                              {promptSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingPromptKey(null)}
                              className="text-xs px-4 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                            {p.isOverridden && (
                              <button
                                onClick={() => setEditingPromptValue(p.defaultValue)}
                                className="text-xs px-4 py-1.5 rounded-lg font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 transition-colors"
                              >
                                Restore Default Text
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">{p.currentValue}</pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* Audit Log Tab */}
      {tab === 'audit' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Admin Audit Log</h2>
              <p className="text-xs text-gray-400 mt-0.5">Entries are retained for 90 days</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{auditTotal} total entries</span>
              <button
                onClick={async () => {
                  const allLogs: typeof auditLogs = [];
                  let page = 0;
                  while (true) {
                    const result = await api.admin.getAuditLog({ search: auditSearch || undefined, page });
                    allLogs.push(...result.logs);
                    if (allLogs.length >= result.total || result.logs.length === 0) break;
                    page++;
                  }
                  const header = 'Time,Admin,Action,Target,Detail';
                  const rows = allLogs.map((l) => {
                    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
                    return [new Date(l.createdAt).toLocaleString(), escape(l.actorEmail), escape(l.action), escape(l.targetLabel), escape(l.detail)].join(',');
                  });
                  const csv = [header, ...rows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-400 dark:hover:bg-brand-900 rounded-lg transition-colors"
                title="Export audit log as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by admin, action, target, or detail..."
              value={auditSearchInput}
              onChange={(e) => setAuditSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setAuditPage(0);
                  setAuditSearch(auditSearchInput.trim());
                }
              }}
              className="w-full pl-9 pr-20 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            {auditSearchInput && (
              <button
                onClick={() => { setAuditSearchInput(''); setAuditPage(0); setAuditSearch(''); }}
                className="absolute right-12 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => { setAuditPage(0); setAuditSearch(auditSearchInput.trim()); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2.5 py-1 rounded-md font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            >
              Search
            </button>
          </div>

          {auditLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No audit entries found</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                      <th className="pb-2 font-medium text-gray-500 dark:text-gray-400 text-xs">Time</th>
                      <th className="pb-2 font-medium text-gray-500 dark:text-gray-400 text-xs">Admin</th>
                      <th className="pb-2 font-medium text-gray-500 dark:text-gray-400 text-xs">Action</th>
                      <th className="pb-2 font-medium text-gray-500 dark:text-gray-400 text-xs">Target</th>
                      <th className="pb-2 font-medium text-gray-500 dark:text-gray-400 text-xs">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-2.5 pr-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                          {new Date(log.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{log.actorEmail}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`inline-flex text-[10px] font-medium px-2 py-0.5 rounded-full ${actionBadgeClass(log.action)}`}>
                            {formatAction(log.action)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={log.targetLabel}>{log.targetLabel}</td>
                        <td className="py-2.5 text-xs text-gray-500 dark:text-gray-400 max-w-[300px] truncate" title={log.detail}>{log.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {auditTotal > 20 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    disabled={auditPage === 0}
                    onClick={() => setAuditPage(p => p - 1)}
                    className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Previous
                  </button>
                  <span className="text-xs text-gray-400">
                    Page {auditPage + 1} of {Math.ceil(auditTotal / 20)}
                  </span>
                  <button
                    disabled={(auditPage + 1) * 20 >= auditTotal}
                    onClick={() => setAuditPage(p => p + 1)}
                    className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!deleteModelTarget}
        title="Delete Model"
        message={`Delete "${deleteModelTarget?.display_name}"? If it has usage history it will be disabled instead.`}
        confirmLabel="Delete"
        onConfirm={() => { if (deleteModelTarget) handleDeleteModel(deleteModelTarget); setDeleteModelTarget(null); }}
        onCancel={() => setDeleteModelTarget(null)}
      />
    </div>
  );
}

// ── Audit Log Helpers ──────────────────────────────────────────────

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function actionBadgeClass(action: string): string {
  if (action.includes('deleted') || action.includes('suspended') || action.includes('rejected') || action.includes('revoked')) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  }
  if (action.includes('created') || action.includes('enabled') || action.includes('approved') || action.includes('unsuspended')) {
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  }
  if (action.includes('updated') || action.includes('changed') || action.includes('reset')) {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

// ── Metrics Dashboard (Usage tab) ──────────────────────────────────

const CHART_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function MiniLineChart({ series, labels }: { series: { label: string; data: number[]; color: string }[]; labels: string[] }) {
  const W = 600;
  const H = 200;
  const PAD = { top: 12, right: 16, bottom: 28, left: 48 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const allValues = series.flatMap((s) => s.data);
  const maxVal = Math.max(...allValues, 1);

  const xStep = labels.length > 1 ? plotW / (labels.length - 1) : 0;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 400 }}>
        {/* Y-axis guides */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = PAD.top + plotH * (1 - frac);
          return (
            <g key={frac}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={0.5} />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" className="text-gray-400 fill-current" fontSize={9}>{fmt(Math.round(maxVal * frac))}</text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {labels.map((l, i) => (
          <text key={i} x={PAD.left + i * xStep} y={H - 6} textAnchor="middle" className="text-gray-400 fill-current" fontSize={9}>{l}</text>
        ))}

        {/* Lines */}
        {series.map((s) => {
          if (s.data.length === 0) return null;
          const points = s.data.map((v, i) => `${PAD.left + i * xStep},${PAD.top + plotH * (1 - v / maxVal)}`).join(' ');
          return (
            <g key={s.label}>
              <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" points={points} />
              {s.data.map((v, i) => (
                <circle key={i} cx={PAD.left + i * xStep} cy={PAD.top + plotH * (1 - v / maxVal)} r={3} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, help }: { label: string; value: string; sub?: string; help?: string }) {
  return (
    <div className="card text-center">
      <p className="text-xs text-gray-400 uppercase tracking-wider inline-flex items-center gap-1">
        {label}
        {help && <HelpTip text={help} />}
      </p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function MetricsDashboard({ metrics, totalUsers }: { metrics: PlatformMetrics; totalUsers: number }) {
  const now = new Date();
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const mo = metrics.monthly[currentKey];

  // Build YTD monthly keys
  const ytdKeys = useMemo(() => {
    const keys: string[] = [];
    const year = now.getUTCFullYear();
    for (let m = 0; m <= now.getUTCMonth(); m++) {
      keys.push(`${year}-${String(m + 1).padStart(2, '0')}`);
    }
    return keys;
  }, []);

  const ytdLabels = ytdKeys.map((k) => {
    const [, m] = k.split('-');
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10) - 1];
  });

  const ytdSeries = useMemo(() => {
    const get = (key: string, field: keyof MonthlySnapshot) => (metrics.monthly[key]?.[field] as number) ?? 0;
    return [
      { label: 'Documents', data: ytdKeys.map((k) => get(k, 'documents')), color: CHART_COLORS[0] },
      { label: 'Payloads', data: ytdKeys.map((k) => get(k, 'payloads')), color: CHART_COLORS[1] },
      { label: 'Web Pages', data: ytdKeys.map((k) => get(k, 'webPages')), color: CHART_COLORS[2] },
      { label: 'QR Codes', data: ytdKeys.map((k) => get(k, 'qrCodes')), color: CHART_COLORS[3] },
      { label: 'Images', data: ytdKeys.map((k) => get(k, 'images')), color: CHART_COLORS[4] },
      { label: 'Custom Actions', data: ytdKeys.map((k) => get(k, 'customActions')), color: CHART_COLORS[5] },
    ];
  }, [metrics, ytdKeys]);

  const ytdUserSeries = useMemo(() => {
    const get = (key: string, field: keyof MonthlySnapshot) => {
      const snap = metrics.monthly[key];
      if (!snap) return 0;
      if (field === 'activeUserIds') return (snap.activeUserIds ?? []).length;
      return (snap[field] as number) ?? 0;
    };
    return [
      { label: 'New Users', data: ytdKeys.map((k) => get(k, 'newUsers')), color: CHART_COLORS[0] },
      { label: 'Active Users', data: ytdKeys.map((k) => get(k, 'activeUserIds')), color: CHART_COLORS[2] },
    ];
  }, [metrics, ytdKeys]);

  return (
    <div className="space-y-8">
      {/* All Time */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">All Time</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Tokens In" value={fmt(metrics.totalTokensIn)} help="Total input tokens sent to LLMs across all time." />
          <StatCard label="Tokens Out" value={fmt(metrics.totalTokensOut)} help="Total output tokens generated by LLMs across all time." />
          <StatCard label="Unique Users" value={fmt(totalUsers)} help="Total registered users on the platform." />
          <StatCard label="Documents" value={fmt(metrics.totalDocuments)} help="Total documents generated (all types)." />
          <StatCard label="Images" value={fmt(metrics.totalImages)} help="Total PNG and SVG images generated." />
          <StatCard label="Payloads" value={fmt(metrics.totalPayloads)} help="Total payloads generated across all formats." />
          <StatCard label="QR Codes" value={fmt(metrics.totalQrCodes)} help="Total standalone QR code images generated." />
          <StatCard label="Web Pages" value={fmt(metrics.totalPages)} help="Total web pages created." />
          <StatCard label="Custom Actions" value={fmt(metrics.totalCustomActions)} help="Total custom AI actions executed." />
        </div>
      </div>

      {/* This Month */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">This Month</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="New Users" value={fmt(mo?.newUsers ?? 0)} help="Users who registered this month." />
          <StatCard label="Active Users" value={fmt(mo?.activeUserIds?.length ?? 0)} help="Unique users who made LLM calls this month." />
          <StatCard label="Tokens In" value={fmt(mo?.tokensIn ?? 0)} />
          <StatCard label="Tokens Out" value={fmt(mo?.tokensOut ?? 0)} />
          <StatCard label="Documents" value={fmt(mo?.documents ?? 0)} />
          <StatCard label="Images" value={fmt(mo?.images ?? 0)} />
          <StatCard label="Payloads" value={fmt(mo?.payloads ?? 0)} />
          <StatCard label="QR Codes" value={fmt(mo?.qrCodes ?? 0)} />
          <StatCard label="Web Pages" value={fmt(mo?.webPages ?? 0)} />
          <StatCard label="Custom Actions" value={fmt(mo?.customActions ?? 0)} />
        </div>
      </div>

      {/* YTD Generation Trends */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">YTD Generation Trends</h2>
        <MiniLineChart series={ytdSeries} labels={ytdLabels} />
      </div>

      {/* YTD User Trends */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">YTD User Trends</h2>
        <MiniLineChart series={ytdUserSeries} labels={ytdLabels} />
      </div>
    </div>
  );
}
