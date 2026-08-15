import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Image, Zap, Globe, ArrowRight, Shield, ExternalLink, MessageSquarePlus } from 'lucide-react';
import FeedbackModal from '../components/FeedbackModal';

const CAPABILITIES = [
  {
    icon: FileText,
    title: 'Documents',
    count: '12 formats',
    description: 'Word, HTML, PowerPoint, Excel, PDF, CSV, Markdown, Calendar, Contact, JSON, YAML, RTF',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  {
    icon: Image,
    title: 'Images',
    count: '5 formats',
    description: 'PNG, SVG, JPEG, WebP, GIF — test AI vision model security with embedded payloads',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  {
    icon: Zap,
    title: 'Payloads',
    count: '7,320+ combos',
    description: 'Raw injection strings across every technique and action target — copy, adapt, embed',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  {
    icon: Globe,
    title: 'Web Pages',
    count: 'Social engineering',
    description: 'Phishing-style test pages with embedded payloads for evaluating browser & AI defenses',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
];

const STEPS = [
  { step: '1', title: 'Select technique', description: 'Choose from 60+ XPIA injection techniques across 6 embedding methods' },
  { step: '2', title: 'Choose format(s)', description: 'Pick document types, image formats, payloads, or web pages to generate' },
  { step: '3', title: 'Generate & test', description: 'Download artifacts and test them against your AI systems for resilience' },
];

const FRAMEWORKS = [
  { label: 'MITRE ATLAS v4.0', href: 'https://atlas.mitre.org/' },
  { label: 'OWASP LLM Top 10 2025', href: 'https://genai.owasp.org/llm-top-10/' },
  { label: 'NIST AI RMF', href: 'https://www.nist.gov/itl/ai-risk-management-framework' },
];

export default function LandingPage() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-gray-900 to-brand-900 text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-brand-950/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <img src="/Xpia shield no background.png" alt="" className="w-8 h-8" />
            <span className="font-bold text-lg tracking-tight">XPIA Tools</span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/20">Beta</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/help" className="hidden sm:inline-flex text-sm text-gray-400 hover:text-white transition-colors">
              Help
            </Link>
            <Link to="/login" className="text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
              Sign In
            </Link>
            <Link to="/register" className="text-sm font-medium bg-brand-600 hover:bg-brand-500 transition-colors px-4 py-1.5 rounded-lg">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 sm:pt-28 sm:pb-24 text-center">
        <div className="flex items-center justify-center gap-4 mb-8">
          <img src="/Xpia shield no background.png" alt="" className="h-16 sm:h-20 drop-shadow-2xl" />
          <div className="text-left">
            <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">XPIA Tools</span>
            <p className="text-xs sm:text-sm text-brand-400 tracking-widest uppercase font-medium mt-0.5">AI Security Research Toolkit</p>
          </div>
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
          Test AI Defenses,<br className="hidden sm:inline" /> Before Attackers Do
        </h1>
        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Generate cross-prompt injection test artifacts — documents, images, payloads, and web pages —
          to evaluate the resilience of AI and LLM systems you&apos;re authorized to test.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link to="/register" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 transition-colors px-6 py-3 rounded-xl font-semibold text-base shadow-lg shadow-brand-600/25">
            Get Started <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/login" className="inline-flex items-center gap-2 border border-white/10 hover:border-white/20 hover:bg-white/5 transition-colors px-6 py-3 rounded-xl font-medium text-base text-gray-300">
            Sign In
          </Link>
        </div>
      </section>

      {/* Capabilities */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 text-center mb-10">What you can generate</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CAPABILITIES.map((cap) => (
            <div key={cap.title} className={`${cap.bg} border ${cap.border} rounded-2xl p-6 transition-transform hover:scale-[1.02]`}>
              <cap.icon className={`w-8 h-8 ${cap.color} mb-4`} />
              <h3 className="text-lg font-bold mb-1">{cap.title}</h3>
              <p className={`text-xs font-semibold ${cap.color} mb-2`}>{cap.count}</p>
              <p className="text-sm text-gray-400 leading-relaxed">{cap.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 text-center mb-12">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.step} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-600/20 text-brand-400 text-lg font-bold mb-4">
                  {s.step}
                </div>
                <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Framework Alignment */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 text-center mb-8">Aligned with industry frameworks</h2>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {FRAMEWORKS.map((fw) => (
            <a
              key={fw.label}
              href={fw.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-300 border border-white/10 rounded-full px-5 py-2 hover:bg-white/5 hover:border-white/20 transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-brand-400" />
              {fw.label}
              <ExternalLink className="w-3 h-3 text-gray-500" />
            </a>
          ))}
        </div>
      </section>

      {/* Founder */}
      <section className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <p className="text-sm text-gray-500 mb-2">Built by</p>
          <a
            href="https://www.linkedin.com/in/jacoblewisadams"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-lg font-semibold text-white hover:text-brand-400 transition-colors"
          >
            Jacob Adams
            <ExternalLink className="w-4 h-4 text-gray-500" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-brand-950/50">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} XPIA Tools</p>
          <div className="flex items-center gap-6">
            <Link to="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
            <Link to="/help" className="hover:text-gray-300 transition-colors">Help</Link>
            <button onClick={() => setFeedbackOpen(true)} className="hover:text-gray-300 transition-colors inline-flex items-center gap-1.5">
              <MessageSquarePlus className="w-3.5 h-3.5" /> Feedback
            </button>
            <a href="https://www.reddit.com/r/XPIATools/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors inline-flex items-center gap-1.5">
              Reddit <ExternalLink className="w-3 h-3" />
            </a>
            <a href="https://discord.gg/XUPR9ywh25" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors inline-flex items-center gap-1.5">
              Discord <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} variant="dark" />
    </div>
  );
}
