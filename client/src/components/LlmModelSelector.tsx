import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Sparkles, ChevronDown } from 'lucide-react';

interface Model {
  id: string;
  model_id: string;
  display_name: string;
  provider_name: string;
  provider_display_name: string;
}

interface LlmModelSelectorProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  /** When false the user has never explicitly toggled; auto-enable when models are available. */
  hasExplicitPreference?: boolean;
}

export default function LlmModelSelector({
  enabled,
  onEnabledChange,
  selectedModelId,
  onModelChange,
  hasExplicitPreference = true,
}: LlmModelSelectorProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const loadModels = () => {
    setLoading(true);
    setFetchError(false);
    api.llm
      .getModels()
      .then(({ models }) => {
        setModels(models);
        if (models.length > 0 && (!selectedModelId || !models.some(m => m.id === selectedModelId))) {
          onModelChange(models[0].id);
        }
        // Auto-enable when the user has never toggled and models are available
        if (models.length > 0 && !hasExplicitPreference) {
          onEnabledChange(true);
        }
      })
      .catch(() => {
        setModels([]);
        setFetchError(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadModels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasModels = models.length > 0;

  return (
    <div className="flex items-center gap-3 h-9">
      <button
        type="button"
        onClick={() => hasModels && onEnabledChange(!enabled)}
        disabled={!hasModels}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
          enabled && hasModels ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
        title={hasModels ? (enabled ? 'Disable AI assist' : 'Enable AI assist') : 'No models available — add an API key in Settings'}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
            enabled && hasModels ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <Sparkles className={`w-4 h-4 shrink-0 ${enabled && hasModels ? 'text-brand-500' : 'text-gray-400'}`} />
      {enabled && hasModels ? (
        <div className="relative">
          <select
            className="select !py-1.5 !pl-3 !pr-8 !text-sm w-full sm:w-auto sm:min-w-[200px]"
            value={selectedModelId}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={loading}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name} ({m.provider_display_name})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
      ) : (
        <span className="text-sm text-gray-400 leading-9">
          {loading ? 'Loading models…' : fetchError ? (
            <button onClick={loadModels} className="text-red-400 hover:text-red-300 underline underline-offset-2">Failed to load models — retry</button>
          ) : hasModels ? 'Using deterministic templates' : (
            <>No models — <Link to="/app/settings" className="text-brand-500 hover:text-brand-400 underline underline-offset-2">add an API key</Link></>
          )}
        </span>
      )}
    </div>
  );
}
