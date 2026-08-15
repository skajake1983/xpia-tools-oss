import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import HelpTip from '../components/HelpTip';
import { Plus, Pencil, Trash2, Check, RotateCcw, FileText, Image, Zap, Globe, Loader2 } from 'lucide-react';

type Category = 'document' | 'image' | 'payload' | 'page';

interface PromptTemplate {
  id: string;
  userId: string | null;
  category: Category;
  name: string;
  systemPrompt: string;
  userPrompt: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_META: Record<Category, { label: string; icon: typeof FileText; description: string; placeholders: string }> = {
  document: {
    label: 'Documents',
    icon: FileText,
    description: 'Prompts used when generating document content with AI enhancement',
    placeholders: '{{DOC_TYPE_DESCRIPTION}}, {{TECHNIQUE_NAME}}, {{EMBEDDING_METHOD}}, {{RAW_PAYLOAD}}, {{CONTENT_SCHEMA}}',
  },
  image: {
    label: 'Images',
    icon: Image,
    description: 'Prompts used when generating image content with AI enhancement',
    placeholders: '{{DOC_TYPE_DESCRIPTION}}, {{TECHNIQUE_NAME}}, {{EMBEDDING_METHOD}}, {{SEVERITY_INSTRUCTION}}, {{STEALTH_INSTRUCTION}}, {{RAW_PAYLOAD}}, {{CONTENT_SCHEMA}}',
  },
  payload: {
    label: 'Payloads',
    icon: Zap,
    description: 'Prompts used when enhancing XPIA payloads with AI',
    placeholders: '{{PAYLOAD_COUNT}}, {{PAYLOAD_SUMMARY}}',
  },
  page: {
    label: 'Web Pages',
    icon: Globe,
    description: 'Prompts used when generating web page content with AI',
    placeholders: '{{PAGE_TITLE}}, {{EMBEDDING_METHOD}}',
  },
};

const CATEGORIES: Category[] = ['document', 'image', 'payload', 'page'];

export default function PromptTemplatesPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [active, setActive] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSystem, setEditSystem] = useState('');
  const [editUser, setEditUser] = useState('');
  const [saving, setSaving] = useState(false);

  // Create state
  const [creating, setCreating] = useState<Category | null>(null);
  const [newName, setNewName] = useState('');
  const [newSystem, setNewSystem] = useState('');
  const [newUser, setNewUser] = useState('');

  const loadData = useCallback(async () => {
    try {
      const { templates: t, active: a } = await api.promptTemplates.list();
      setTemplates(t);
      setActive(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-clear messages
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 3000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(t);
    }
  }, [error]);

  const userTemplateCount = templates.filter(t => !t.isSystem).length;

  const handleCreate = async () => {
    if (!creating || !newName.trim() || !newSystem.trim() || !newUser.trim()) return;
    setSaving(true);
    try {
      await api.promptTemplates.create({
        category: creating,
        name: newName.trim(),
        systemPrompt: newSystem,
        userPrompt: newUser,
      });
      setCreating(null);
      setNewName('');
      setNewSystem('');
      setNewUser('');
      setSuccess('Template created');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim() || !editSystem.trim() || !editUser.trim()) return;
    setSaving(true);
    try {
      await api.promptTemplates.update(editingId, {
        name: editName.trim(),
        systemPrompt: editSystem,
        userPrompt: editUser,
      });
      setEditingId(null);
      setSuccess('Template updated');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.promptTemplates.delete(id);
      setSuccess('Template deleted');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

  const handleAssign = async (category: Category, templateId: string) => {
    try {
      await api.promptTemplates.assign(category, templateId);
      setSuccess('Template activated');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign template');
    }
  };

  const handleUnassign = async (category: Category) => {
    try {
      await api.promptTemplates.unassign(category);
      setSuccess('Reverted to system default');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unassign template');
    }
  };

  const startEdit = (t: PromptTemplate) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditSystem(t.systemPrompt);
    setEditUser(t.userPrompt);
  };

  const startCreate = (category: Category) => {
    // Pre-fill from system default for convenience
    const systemDefault = templates.find(t => t.isSystem && t.category === category);
    setCreating(category);
    setNewName('');
    setNewSystem(systemDefault?.systemPrompt ?? '');
    setNewUser(systemDefault?.userPrompt ?? '');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Prompt Templates</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Customize the AI prompts used for document, payload, and web page generation.
          <HelpTip text="Each category has a system default. Create custom templates and activate them to override the default. Your active template is used whenever you generate content with AI." />
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {userTemplateCount} / 30 custom templates
        </p>
      </div>

      {/* Status messages */}
      {success && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-sm font-medium flex items-center gap-2">
          <Check className="w-4 h-4" /> {success}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Categories */}
      <div className="space-y-8">
        {CATEGORIES.map(cat => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          const catTemplates = templates.filter(t => t.category === cat);
          const activeId = active[cat];

          return (
            <div key={cat} className="card">
              {/* Category header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-950/40">
                    <Icon className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{meta.label}</h2>
                    <p className="text-xs text-gray-400">{meta.description}</p>
                  </div>
                </div>
                {userTemplateCount < 30 && creating !== cat && (
                  <button
                    onClick={() => startCreate(cat)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Template
                  </button>
                )}
              </div>

              {/* Placeholders info */}
              <div className="mb-4 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-600 dark:text-gray-300">Available placeholders:</span>{' '}
                <code className="text-[11px]">{meta.placeholders}</code>
              </div>

              {/* Create form */}
              {creating === cat && (
                <div className="mb-4 border border-brand-200 dark:border-brand-800 rounded-xl p-4 bg-brand-50/30 dark:bg-brand-950/20">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">New {meta.label} Template</h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Template name"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      maxLength={100}
                      className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">System Prompt</label>
                      <textarea
                        value={newSystem}
                        onChange={e => setNewSystem(e.target.value)}
                        rows={4}
                        className="w-full text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">User Prompt</label>
                      <textarea
                        value={newUser}
                        onChange={e => setNewUser(e.target.value)}
                        rows={6}
                        className="w-full text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={saving || !newName.trim() || !newSystem.trim() || !newUser.trim()}
                        onClick={handleCreate}
                        className="text-xs px-4 py-1.5 rounded-lg font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                      >
                        {saving ? 'Creating...' : 'Create'}
                      </button>
                      <button
                        onClick={() => setCreating(null)}
                        className="text-xs px-4 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Template list */}
              <div className="space-y-3">
                {catTemplates.map(t => {
                  const isActive = activeId === t.id || (!activeId && t.isSystem);
                  const isEditing = editingId === t.id;

                  return (
                    <div
                      key={t.id}
                      className={`border rounded-xl p-4 transition-colors ${
                        isActive
                          ? 'border-brand-300 dark:border-brand-700 bg-brand-50/40 dark:bg-brand-950/20'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {/* Template header */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{t.name}</p>
                            {t.isSystem && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                                System Default
                              </span>
                            )}
                            {isActive && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400 shrink-0">
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {!isActive && (
                            <button
                              onClick={() => t.isSystem && !activeId ? undefined : handleAssign(cat, t.id)}
                              disabled={isActive}
                              className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-950/40 dark:text-brand-400 dark:hover:bg-brand-950/60 transition-colors"
                              title="Activate this template"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isActive && !t.isSystem && (
                            <button
                              onClick={() => handleUnassign(cat)}
                              className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/40 dark:text-orange-400 dark:hover:bg-orange-950/60 transition-colors"
                              title="Revert to system default"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!t.isSystem && !isEditing && (
                            <>
                              <button
                                onClick={() => startEdit(t)}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(t.id)}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Edit form */}
                      {isEditing ? (
                        <div className="space-y-3 mt-3">
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            maxLength={100}
                            className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                          />
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">System Prompt</label>
                            <textarea
                              value={editSystem}
                              onChange={e => setEditSystem(e.target.value)}
                              rows={4}
                              className="w-full text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">User Prompt</label>
                            <textarea
                              value={editUser}
                              onChange={e => setEditUser(e.target.value)}
                              rows={6}
                              className="w-full text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              disabled={saving || !editName.trim() || !editSystem.trim() || !editUser.trim()}
                              onClick={handleUpdate}
                              className="text-xs px-4 py-1.5 rounded-lg font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs px-4 py-1.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View prompts */
                        <div className="space-y-2 mt-2">
                          <div>
                            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5 uppercase tracking-wider">System Prompt</p>
                            <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">{t.systemPrompt}</pre>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5 uppercase tracking-wider">User Prompt</p>
                            <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">{t.userPrompt}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
