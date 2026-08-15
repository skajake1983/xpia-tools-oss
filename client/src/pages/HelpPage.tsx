import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import HelpContent from '../components/HelpContent';

export default function HelpPage() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  return (
    <div key={pathname} className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Help & Documentation</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Learn how each feature works, how payloads are embedded, and how to use this tool with or without LLM integration.
        </p>
      </div>

      <HelpContent isAdmin={!!user?.isAdmin} />
    </div>
  );
}