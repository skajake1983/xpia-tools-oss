import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import HelpContent from '../components/HelpContent';

export default function PublicHelpPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <img src="/logo-icon.png" alt="" className="w-9 h-9" />
            <h1 className="text-3xl font-bold tracking-tight">XPIA Tools</h1>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/20">Beta</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-300 mt-4">Help & Documentation</h2>
          <p className="mt-1 text-sm text-gray-500">
            Learn how each feature works, how payloads are embedded, and how to use this tool with or without LLM integration.
          </p>
        </div>

        <div className="space-y-6">
          <HelpContent />
        </div>
      </div>
    </div>
  );
}
