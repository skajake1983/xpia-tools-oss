import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Shield, AlertTriangle, CheckCircle2, Scale, Users, Brain, Star, ExternalLink } from 'lucide-react';

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, icon, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 dark:border-gray-700/60 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        {icon}
        <span className="flex-1 font-semibold text-gray-900 dark:text-white">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-6 pb-6 text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

function RatingBadge({ rating }: { rating: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    low: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  const labels = { high: 'High Cooperation', medium: 'Medium Cooperation', low: 'Lower Cooperation' };
  return <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${styles[rating]}`}>{labels[rating]}</span>;
}

const MODEL_RANKINGS: { provider: string; models: string[]; rating: 'high' | 'medium' | 'low'; recommended?: boolean; notes: string }[] = [
  { provider: 'xAI (Grok)', models: ['Grok 3', 'Grok 3 Mini'], rating: 'high', recommended: true, notes: 'Lowest refusal rate for security research. Minimal content filtering on research-framed requests.' },
  { provider: 'Google (Gemini)', models: ['Gemini 2.5 Pro', 'Gemini 2.0 Flash'], rating: 'high', recommended: true, notes: 'Very cooperative with security research framing. Supports Google\'s own Bug Bounty and AI safety programs.' },
  { provider: 'OpenAI', models: ['GPT-5.4', 'GPT-5', 'GPT-5 Mini', 'o3', 'o4-mini'], rating: 'medium', recommended: true, notes: 'Permitted under OpenAI usage policy for security research. Occasional refusals on edge-case payloads; re-prompting usually works.' },
];

export default function RoePage() {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Rules of Engagement</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          LLM provider policies, model compatibility for security research, and compliance practices.
        </p>
      </div>

      {/* Purpose & Scope */}
      <Section title="Purpose & Scope" icon={<Scale className="w-5 h-5 text-brand-600" />} defaultOpen>
        <p>
          This tool generates XPIA (Cross-Plugin/Prompt Injection Attack) test artifacts for <strong>authorized security research and AI red-teaming</strong>.
          When LLM integration is used, each API request includes a server-injected research context prompt that identifies:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>The request originates from an <strong>authorized security research platform</strong></li>
          <li>Activities target <strong>controlled lab environments</strong> — no real users or production systems</li>
          <li>The work is <strong>XPIA testing</strong> — a recognized discipline in AI safety</li>
          <li>The provider's own usage policies permit this category of security research</li>
        </ul>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4 text-blue-800 dark:text-blue-300 text-xs">
          <strong>Compliance:</strong> Every LLM API call is logged with metadata confirming the research context prompt was injected. This creates an audit trail demonstrating responsible use.
        </div>
      </Section>

      {/* Bug Bounty & Vulnerability Disclosure Programs */}
      <Section title="Bug Bounty & Disclosure Programs" icon={<ExternalLink className="w-5 h-5 text-brand-600" />}>
        <p>
          Each LLM provider operates a bug bounty or vulnerability disclosure program that recognizes and rewards AI security research.
          Submit findings through these official channels:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <a
            href="https://bugcrowd.com/openai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50 hover:border-brand-400 dark:hover:border-brand-500 transition-colors group"
          >
            <div className="flex-1">
              <span className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">OpenAI</span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Bugcrowd &mdash; Bug Bounty Program</p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-brand-500 transition-colors shrink-0" />
          </a>
          <a
            href="https://bughunters.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50 hover:border-brand-400 dark:hover:border-brand-500 transition-colors group"
          >
            <div className="flex-1">
              <span className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">Google</span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Bug Hunters &mdash; Vulnerability Reward Program</p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-brand-500 transition-colors shrink-0" />
          </a>
          <a
            href="https://hackerone.com/xai_bbp"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50 hover:border-brand-400 dark:hover:border-brand-500 transition-colors group"
          >
            <div className="flex-1">
              <span className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">xAI</span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">HackerOne &mdash; Bug Bounty Program</p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-brand-500 transition-colors shrink-0" />
          </a>
        </div>
      </Section>

      {/* Model Compatibility Matrix */}
      <Section title="Model Compatibility Ranking" icon={<Star className="w-5 h-5 text-yellow-500" />}>
        <p>
          Not all LLMs cooperate equally with security research content generation. This ranking is based on real-world testing
          of each provider's response to properly-framed XPIA research requests.
        </p>
        <div className="space-y-3 mt-3">
          {MODEL_RANKINGS.map((entry, i) => (
            <div key={entry.provider} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/50">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  #{i + 1} {entry.provider}
                </span>
                <RatingBadge rating={entry.rating} />
                {entry.recommended && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
                    <Star className="w-3 h-3" /> Recommended
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                Models: {entry.models.join(', ')}
              </p>
              <p className="text-xs">{entry.notes}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Per-Provider Policies */}
      <Section title="OpenAI Policy" icon={<Brain className="w-5 h-5 text-green-600" />}>
        <h4 className="font-semibold text-gray-900 dark:text-white">Usage Policy Alignment</h4>
        <p>
          OpenAI's Usage Policies explicitly permit security research and red-teaming activities aimed at improving AI safety.
          Their Red Teaming Network program actively recruits researchers to test model safety boundaries.
        </p>
        <h4 className="font-semibold text-gray-900 dark:text-white mt-2">Research Framing Approach</h4>
        <p>
          Our system prompt references the controlled research environment, identifies the work as XPIA testing,
          and notes that security research is a permitted use case per their policy. This typically reduces refusal rates
          for legitimate research content.
        </p>
        <h4 className="font-semibold text-gray-900 dark:text-white mt-2">Expected Behavior</h4>
        <p>
          GPT-4.1 and GPT-4o models generally cooperate well with properly-framed research requests.
          Occasional refusals may occur on edge-case payloads — re-prompting with additional context usually resolves this.
          The o-series reasoning models (o1, o3, o4-mini) tend to be slightly more cautious.
        </p>
      </Section>

      <Section title="Google Policy" icon={<Brain className="w-5 h-5 text-blue-600" />}>
        <h4 className="font-semibold text-gray-900 dark:text-white">Usage Policy Alignment</h4>
        <p>
          Google actively supports AI security research through programs like the AI Bug Bounty, Vulnerability Reward Program,
          and partnerships with security researchers. Their policies align strongly with responsible security testing.
        </p>
        <h4 className="font-semibold text-gray-900 dark:text-white mt-2">Research Framing Approach</h4>
        <p>
          Our system prompt references the sandboxed research environment and Google's own support for security research
          and responsible vulnerability disclosure.
        </p>
        <h4 className="font-semibold text-gray-900 dark:text-white mt-2">Expected Behavior</h4>
        <p>
          Gemini models are very cooperative with security research. Gemini 2.5 Pro in particular handles complex
          XPIA payload generation well. Low refusal rates when research context is properly established.
        </p>
      </Section>

      <Section title="xAI Policy" icon={<Brain className="w-5 h-5 text-gray-600 dark:text-gray-400" />}>
        <h4 className="font-semibold text-gray-900 dark:text-white">Usage Policy Alignment</h4>
        <p>
          xAI positions Grok as a model with fewer content restrictions, making it well-suited for security research.
          Their approach emphasizes providing accurate, uncensored responses for legitimate use cases.
        </p>
        <h4 className="font-semibold text-gray-900 dark:text-white mt-2">Expected Behavior</h4>
        <p>
          Grok models have the lowest refusal rate of all providers. They consistently generate requested security
          research content with minimal friction. This makes Grok the most reliable choice for XPIA content generation.
        </p>
      </Section>

      {/* How System Prompts Work */}
      <Section title="How Research Framing Works" icon={<Shield className="w-5 h-5 text-brand-600" />}>
        <h4 className="font-semibold text-gray-900 dark:text-white">Server-Side Injection</h4>
        <p>
          Research context is injected <strong>server-side</strong> — it cannot be modified, bypassed, or removed by the user.
          Every LLM API call (document enhancement, payload enhancement, page enhancement) automatically receives
          a provider-specific system message prepended to the conversation.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-white mt-2">Provider-Specific Framing</h4>
        <p>
          Each provider receives a tailored system prompt that references their specific policies and programs.
          For example, OpenAI prompts reference the Red Teaming Network and Google prompts reference the AI Bug Bounty.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-white mt-2">Audit Trail</h4>
        <p>
          Every API call is logged with:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>researchPromptInjected:</strong> Confirms the research context was applied</li>
          <li><strong>researchPromptProvider:</strong> Which provider-specific prompt was used</li>
          <li><strong>User ID, model, timestamp, token usage, and cost</strong></li>
        </ul>
        <p>
          This metadata creates a compliance audit trail proving that every AI interaction was properly framed as authorized security research.
        </p>
      </Section>

      {/* Shared Principles */}
      <Section title="Shared Principles" icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}>
        <p>Across all providers, the following principles are consistently communicated:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Authorization:</strong> All research is conducted by vetted, authorized researchers</li>
          <li><strong>Isolation:</strong> No real users, production systems, or live targets are involved</li>
          <li><strong>Purpose:</strong> Work is specifically XPIA testing for AI safety improvement</li>
          <li><strong>Policy compliance:</strong> Activities fall within each provider's stated acceptable use</li>
          <li><strong>Auditability:</strong> Full logging of all interactions for compliance review</li>
        </ul>
      </Section>

      {/* User Responsibilities */}
      <Section title="User Responsibilities" icon={<Users className="w-5 h-5 text-red-600" />}>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 text-amber-800 dark:text-amber-300 text-xs mb-3">
          <AlertTriangle className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          <strong>Important:</strong> System-level compliance framing does not replace your responsibility to use this tool ethically and legally.
        </div>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Authorization:</strong> Only test AI systems you own or have explicit written permission to test</li>
          <li><strong>Scope:</strong> Keep testing within the agreed-upon scope of your research engagement</li>
          <li><strong>Disclosure:</strong> Follow responsible disclosure practices for any vulnerabilities discovered</li>
          <li><strong>Legal compliance:</strong> Ensure your research complies with all applicable laws and regulations in your jurisdiction</li>
          <li><strong>API key security:</strong> Your API keys are encrypted at rest, but you are responsible for not sharing credentials</li>
          <li><strong>Cost management:</strong> Monitor your LLM usage on the Usage page — per-user limits are enforced but you are responsible for your provider billing</li>
        </ul>
      </Section>
    </div>
  );
}
