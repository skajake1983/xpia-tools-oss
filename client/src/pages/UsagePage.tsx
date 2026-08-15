import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { BarChart3, Zap, Clock, Activity, AlertCircle, CheckCircle2, AlertTriangle, Eye, X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

interface UsageSummary {
  daily: { totalCalls: number; totalInputTokens: number; totalOutputTokens: number; tokenLimit: number };
  monthly: { totalCalls: number; totalInputTokens: number; totalOutputTokens: number };
  limits: { isSuspended: boolean };
}

interface DailyEntry {
  date: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

interface ModelEntry {
  modelId: string;
  displayName: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

interface RecentLogEntry {
  id: string;
  purpose: string;
  model_id: string;
  provider_id: string;
  model_display_name: string | null;
  provider_display_name: string | null;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  status: 'ok' | 'error' | 'limit_hit';
  error_message: string | null;
  created_at: string;
}

interface LogDetail {
  id: string;
  purpose: string;
  model_id: string;
  provider_id: string;
  model_display_name: string | null;
  provider_display_name: string | null;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  status: string;
  error_message: string | null;
  prompt_messages: string | null;
  response_text: string | null;
  created_at: string;
}

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [daily, setDaily] = useState<DailyEntry[]>([]);
  const [modelUsage, setModelUsage] = useState<ModelEntry[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logDetail, setLogDetail] = useState<LogDetail | null>(null);
  const [logDetailLoading, setLogDetailLoading] = useState(false);
  const [logPage, setLogPage] = useState(0);
  const LOG_PAGE_SIZE = 10;

  const viewLog = async (id: string) => {
    setLogDetailLoading(true);
    try {
      const { entry } = await api.usage.getLogDetail(id);
      setLogDetail(entry);
    } catch {
      /* empty */
    } finally {
      setLogDetailLoading(false);
    }
  };

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    try {
      const [current, dailyData, modelData, recentData] = await Promise.all([
        api.usage.getCurrent(),
        api.usage.getDaily(),
        api.usage.getModels(),
        api.usage.getRecent(100),
      ]);
      setSummary(current);
      setDaily(dailyData.daily);
      setModelUsage(modelData.models);
      setRecentLogs((recentData.recent ?? []) as RecentLogEntry[]);
    } catch (err) {
      console.error('[UsagePage] loadUsage failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading usage data…</div>;
  if (!summary) return <div className="text-center py-12 text-gray-400">Unable to load usage data.</div>;

  const dailyTokenUsed = summary.daily.totalInputTokens + summary.daily.totalOutputTokens;
  const monthlyTokenUsed = summary.monthly.totalInputTokens + summary.monthly.totalOutputTokens;

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-brand-600" />
          Usage Dashboard
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Monitor your LLM usage across calls, tokens, and models</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Today\'s Calls', value: summary.daily.totalCalls, icon: Zap, sub: '' },
          { label: 'Today\'s Tokens', value: dailyTokenUsed.toLocaleString(), icon: Activity, sub: `${summary.daily.totalInputTokens.toLocaleString()} in / ${summary.daily.totalOutputTokens.toLocaleString()} out` },
          { label: 'Monthly Calls', value: summary.monthly.totalCalls, icon: Clock, sub: `${monthlyTokenUsed.toLocaleString()} total tokens` },
        ].map((c) => (
          <div key={c.label} className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 uppercase tracking-wider">{c.label}</p>
              <c.icon className="w-4 h-4 text-gray-300" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{c.value}</p>
            <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Per-model breakdown */}
      {modelUsage.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Monthly Usage by Model</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="pb-3 font-medium">Model</th>
                  <th className="pb-3 font-medium text-right">Calls</th>
                  <th className="pb-3 font-medium text-right">Input Tokens</th>
                  <th className="pb-3 font-medium text-right">Output Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {modelUsage.map((m) => (
                  <tr key={m.modelId} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{m.displayName}</td>
                    <td className="py-2 text-right text-gray-600 dark:text-gray-400">{m.calls}</td>
                    <td className="py-2 text-right text-gray-500 dark:text-gray-400">{m.inputTokens.toLocaleString()}</td>
                    <td className="py-2 text-right text-gray-500 dark:text-gray-400">{m.outputTokens.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily trend chart */}
      {daily.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Daily Activity (Last 30 Days)</h2>
          {(() => {
            const maxCalls = Math.max(...daily.map((d) => d.calls), 1);
            const w = 600;
            const h = 160;
            const padX = 0;
            const padY = 8;
            const plotW = w - padX * 2;
            const plotH = h - padY * 2;
            const step = daily.length > 1 ? plotW / (daily.length - 1) : 0;
            const points = daily.map((d, i) => {
              const x = padX + i * step;
              const y = padY + plotH - (d.calls / maxCalls) * plotH;
              return `${x},${y}`;
            });
            return (
              <div className="relative">
                <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40" preserveAspectRatio="none">
                  {/* Fill area */}
                  <polygon
                    points={`${padX},${h - padY} ${points.join(' ')} ${padX + (daily.length - 1) * step},${h - padY}`}
                    className="fill-brand-100 dark:fill-brand-900/30"
                  />
                  {/* Line */}
                  <polyline
                    points={points.join(' ')}
                    fill="none"
                    className="stroke-brand-500"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {/* Hover dots layer */}
                <div className="absolute inset-0 flex">
                  {daily.map((d) => (
                    <div
                      key={d.date}
                      className="flex-1 group relative"
                    >
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                        {d.date}: {d.calls} calls, {(d.inputTokens + d.outputTokens).toLocaleString()} tokens
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>{daily[0]?.date}</span>
            <span>{daily[daily.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Monthly API Calls Log */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Monthly API Calls</h2>
          <span className="text-xs text-gray-400">Retained for 30 days</span>
        </div>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No API calls yet. Enable AI Assist on any feature to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="pb-3 font-medium">Time</th>
                  <th className="pb-3 font-medium">Model</th>
                  <th className="pb-3 font-medium">Purpose</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Tokens</th>
                  <th className="pb-3 font-medium text-right">Duration</th>
                  <th className="pb-3 font-medium text-center">Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentLogs.slice(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE).map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {log.model_display_name || log.model_id}
                    </td>
                    <td className="py-2.5 text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        {log.purpose.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {log.status === 'ok' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> OK
                        </span>
                      ) : log.status === 'error' ? (
                        <span className="group relative inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 cursor-help">
                          <AlertCircle className="w-3.5 h-3.5" /> Error
                          {log.error_message && (
                            <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-3 py-2 rounded-lg whitespace-normal max-w-xs z-20 shadow-lg">
                              {log.error_message}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="group relative inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 cursor-help">
                          <AlertTriangle className="w-3.5 h-3.5" /> Limit
                          {log.error_message && (
                            <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-3 py-2 rounded-lg whitespace-normal max-w-xs z-20 shadow-lg">
                              {log.error_message}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right text-gray-500 dark:text-gray-400 tabular-nums">
                      {(log.input_tokens + log.output_tokens).toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right text-gray-500 dark:text-gray-400 tabular-nums">
                      {log.duration_ms > 0 ? `${(log.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="py-2.5 text-center">
                      <button
                        onClick={() => viewLog(log.id)}
                        disabled={logDetailLoading}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 dark:text-brand-400 dark:hover:text-brand-300 dark:hover:bg-brand-950/50 transition-colors"
                        title="View prompt & response"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentLogs.length > LOG_PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setLogPage((p) => p - 1)}
                  disabled={logPage === 0}
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <span className="text-xs text-gray-400">
                  {logPage + 1} / {Math.ceil(recentLogs.length / LOG_PAGE_SIZE)}
                </span>
                <button
                  onClick={() => setLogPage((p) => p + 1)}
                  disabled={(logPage + 1) * LOG_PAGE_SIZE >= recentLogs.length}
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      {logDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setLogDetail(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col m-4" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">API Call Log</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(logDetail.created_at).toLocaleString()} · {logDetail.model_display_name || logDetail.model_id} · {logDetail.purpose.replace(/_/g, ' ')}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const lines: string[] = [];
                    lines.push(`API Call Log`);
                    lines.push(`Date: ${new Date(logDetail.created_at).toLocaleString()}`);
                    lines.push(`Model: ${logDetail.model_display_name || logDetail.model_id}`);
                    lines.push(`Purpose: ${logDetail.purpose.replace(/_/g, ' ')}`);
                    lines.push(`Status: ${logDetail.status.toUpperCase()}`);
                    lines.push(`Tokens: ${logDetail.input_tokens} in / ${logDetail.output_tokens} out`);
                    lines.push(`Duration: ${logDetail.duration_ms > 0 ? `${(logDetail.duration_ms / 1000).toFixed(1)}s` : '—'}`);
                    if (logDetail.error_message) {
                      lines.push('', '--- ERROR ---', logDetail.error_message);
                    }
                    if (logDetail.prompt_messages) {
                      lines.push('', '--- MESSAGES SENT ---');
                      for (const msg of JSON.parse(logDetail.prompt_messages) as { role: string; content: string }[]) {
                        lines.push('', `[${msg.role.toUpperCase()}]`, msg.content);
                      }
                    }
                    if (logDetail.response_text) {
                      lines.push('', '--- RESPONSE ---', logDetail.response_text);
                    }
                    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `api-call-${logDetail.purpose}-${new Date(logDetail.created_at).toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Download log"
                >
                  <Download className="w-5 h-5 text-gray-400" />
                </button>
                <button onClick={() => setLogDetail(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Metadata bar */}
            <div className="grid grid-cols-3 gap-4 px-6 py-3 bg-gray-50 dark:bg-gray-800/50 text-xs shrink-0">
              <div>
                <span className="text-gray-400">Status</span>
                <p className={`font-medium ${logDetail.status === 'ok' ? 'text-green-600 dark:text-green-400' : logDetail.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {logDetail.status.toUpperCase()}
                </p>
              </div>
              <div>
                <span className="text-gray-400">Tokens</span>
                <p className="font-medium text-gray-900 dark:text-gray-100">{logDetail.input_tokens.toLocaleString()} in / {logDetail.output_tokens.toLocaleString()} out</p>
              </div>
              <div>
                <span className="text-gray-400">Duration</span>
                <p className="font-medium text-gray-900 dark:text-gray-100">{logDetail.duration_ms > 0 ? `${(logDetail.duration_ms / 1000).toFixed(1)}s` : '—'}</p>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {logDetail.error_message && (
                <div>
                  <h4 className="text-xs font-medium text-red-500 uppercase tracking-wider mb-1">Error</h4>
                  <pre className="text-xs font-mono bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-lg p-3 whitespace-pre-wrap break-words">{logDetail.error_message}</pre>
                </div>
              )}

              {logDetail.prompt_messages && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Messages Sent</h4>
                  <div className="space-y-2">
                    {(JSON.parse(logDetail.prompt_messages) as { role: string; content: string }[]).map((msg, i) => (
                      <div key={i} className={`rounded-lg p-3 ${
                        msg.role === 'system' ? 'bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800' :
                        msg.role === 'user' ? 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800' :
                        'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                      }`}>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                          msg.role === 'system' ? 'text-purple-600 dark:text-purple-400' :
                          msg.role === 'user' ? 'text-blue-600 dark:text-blue-400' :
                          'text-gray-500'
                        }`}>{msg.role}</span>
                        <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words mt-1 max-h-48 overflow-y-auto">{msg.content}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {logDetail.response_text && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Response</h4>
                  <div className="rounded-lg p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">assistant</span>
                    <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words mt-1 max-h-64 overflow-y-auto">{logDetail.response_text}</pre>
                  </div>
                </div>
              )}

              {!logDetail.prompt_messages && !logDetail.response_text && !logDetail.error_message && (
                <p className="text-sm text-gray-400 text-center py-8">No prompt/response data available for this log entry. Logs recorded before this feature was added won't have message content.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
