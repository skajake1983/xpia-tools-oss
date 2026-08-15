import { useAuth } from '../context/AuthContext';
import { FileText, Zap, Globe, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

const FEATURES = [
  {
    to: '/app/documents',
    icon: FileText,
    title: 'Document Generator',
    description: 'Generate documents in 14 formats including .docx, .pdf, .pptx, .xlsx, .htm, .png, .svg, .csv, .md, .ics, .vcf, .json, .yaml, and .rtf with embedded XPIA payloads.',
    color: 'bg-blue-500/10 text-blue-600',
  },
  {
    to: '/app/payloads',
    icon: Zap,
    title: 'Payload Generator',
    description: 'Create structured JSON/text payloads for AI security evaluations. Select categories, severity levels, and evasion techniques.',
    color: 'bg-amber-500/10 text-amber-600',
  },
  {
    to: '/app/pages',
    icon: Globe,
    title: 'XPIA Web Pages',
    description: 'Generate public web pages with embedded XPIA content for testing model behavior with external URLs.',
    color: 'bg-emerald-500/10 text-emerald-600',
  },
];

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Welcome back, {user?.firstName || user?.email}</p>
      </div>

      {/* Security notice */}
      <div className="card !bg-brand-950 !border-brand-900 mb-8">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-600/20 flex-shrink-0">
            <Shield className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Authorized Use Only</h3>
            <p className="text-sm text-gray-400 mt-1 leading-relaxed">
              XPIA Tools is designed for authorized security research and AI safety evaluation.
              All generated content is for testing your own systems and models.
              Always ensure you have proper authorization before conducting security assessments.
            </p>
          </div>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {FEATURES.map((feature) => (
          <Link key={feature.to} to={feature.to} className="card group cursor-pointer">
            <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${feature.color} mb-4`}>
              <feature.icon className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">
              {feature.title}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">{feature.description}</p>
          </Link>
        ))}
      </div>

      {/* Stats could go here in the future */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Attack Categories', value: '10' },
          { label: 'Techniques', value: '32' },
          { label: 'Document Types', value: '14' },
          { label: 'Evasion Methods', value: '8' },
        ].map((stat) => (
          <div key={stat.label} className="card !p-4 text-center">
            <p className="text-2xl font-bold text-brand-700">{stat.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
