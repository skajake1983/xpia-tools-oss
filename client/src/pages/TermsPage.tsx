import { useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <button onClick={() => window.history.length > 1 ? navigate(-1) : window.close()} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-7 h-7 text-brand-500" />
            <h1 className="text-3xl font-bold tracking-tight">XPIA Tools</h1>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">Beta</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-300 mt-4">Terms of Use &amp; Acceptable Use Policy</h2>
          <p className="text-sm text-gray-500 mt-2">Last updated: March 15, 2026</p>
        </div>

        <div className="prose prose-invert prose-sm max-w-none space-y-8">
          {/* 1. Acceptance */}
          <section>
            <h3 className="text-lg font-semibold text-white">1. Acceptance of Terms</h3>
            <p className="text-gray-400 leading-relaxed">
              By creating an account or using XPIA Tools (&ldquo;the Platform&rdquo;), you agree to be bound by these Terms of Use and our Acceptable Use Policy. If you do not agree, you must not use the Platform. We reserve the right to update these terms at any time; continued use after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          {/* 2. Purpose */}
          <section>
            <h3 className="text-lg font-semibold text-white">2. Purpose of the Platform</h3>
            <p className="text-gray-400 leading-relaxed">
              XPIA Tools is designed exclusively for <strong className="text-gray-200">authorized security research, testing, and educational purposes</strong>. The Platform generates prompt injection documents, cross-site scripting (XSS) payloads, social engineering web pages, and related security testing artifacts to help security professionals assess and improve the defenses of systems they are authorized to test.
            </p>
          </section>

          {/* 3. Acceptable Use */}
          <section>
            <h3 className="text-lg font-semibold text-white">3. Acceptable Use Policy</h3>
            <p className="text-gray-400 leading-relaxed mb-3">You agree that you will:</p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>Only use generated content against systems, applications, or models you <strong className="text-gray-200">own or have explicit written authorization to test</strong>.</li>
              <li>Operate within the scope of an authorized engagement, penetration test, bug bounty program, or internal security assessment.</li>
              <li>Comply with all applicable local, state, national, and international laws and regulations.</li>
              <li>Follow responsible disclosure practices when vulnerabilities are discovered.</li>
              <li>Not use the Platform to target individuals, harass, defame, or conduct social engineering attacks against unauthorized targets.</li>
            </ul>
            <p className="text-gray-400 leading-relaxed mt-3 mb-3">You agree that you will <strong className="text-red-400">NOT</strong>:</p>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>Use generated content to gain unauthorized access to any system, network, or data.</li>
              <li>Deploy payloads or documents in production environments without proper authorization and safeguards.</li>
              <li>Use the Platform to create malware, ransomware, or tools for malicious exploitation.</li>
              <li>Distribute generated content to third parties for malicious purposes.</li>
              <li>Attempt to compromise, attack, or disrupt the Platform itself or other users&apos; accounts.</li>
              <li>Misrepresent your authorization or credentials to access the Platform.</li>
            </ul>
          </section>

          {/* 4. Account Responsibility */}
          <section>
            <h3 className="text-lg font-semibold text-white">4. Account Responsibility</h3>
            <p className="text-gray-400 leading-relaxed">
              Access to XPIA Tools requires registration. You are responsible for maintaining the confidentiality of your credentials and for all activity conducted under your account. Two-factor authentication (2FA) is mandatory. You must not share your account credentials with unauthorized individuals. You are solely responsible for how you use the output generated by the Platform.
            </p>
          </section>

          {/* 5. BYOK */}
          <section>
            <h3 className="text-lg font-semibold text-white">5. Bring Your Own Key (BYOK) Model</h3>
            <p className="text-gray-400 leading-relaxed">
              XPIA Tools operates on a Bring Your Own Key model. You provide your own LLM API keys (OpenAI, Google, xAI, etc.) to power AI-generated content. Your API keys are encrypted at rest using AES-256-GCM. You are responsible for your API key usage, billing, and compliance with the respective provider&rsquo;s terms of service. The Platform does not store, log, or transmit your API keys in plaintext.
            </p>
          </section>

          {/* 6. Disclaimer of Liability */}
          <section>
            <h3 className="text-lg font-semibold text-white">6. Disclaimer of Liability</h3>
            <p className="text-gray-400 leading-relaxed">
              THE PLATFORM IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. XPIA Tools, its operators, and contributors are not responsible for any damages, legal consequences, or losses arising from your use of generated content. Generated artifacts are tools for authorized security testing &mdash; any misuse is solely your responsibility. You assume all risk associated with using the Platform and its outputs.
            </p>
          </section>

          {/* 7. Enforcement */}
          <section>
            <h3 className="text-lg font-semibold text-white">7. Enforcement &amp; Termination</h3>
            <p className="text-gray-400 leading-relaxed">
              We reserve the right to suspend or permanently revoke access to any account that violates these terms, without prior notice. Usage may be monitored for compliance purposes. Evidence of malicious use may be reported to the appropriate authorities. Upon termination, all associated data (documents, payloads, pages, API keys, and usage history) may be deleted.
            </p>
          </section>

          {/* 8. Data Handling */}
          <section>
            <h3 className="text-lg font-semibold text-white">8. Data Handling</h3>
            <p className="text-gray-400 leading-relaxed">
              We store your account information, generated content metadata, and usage logs to operate the Platform. API keys are encrypted at rest. You may delete your account and all associated data at any time from Settings. We do not sell or share your data with third parties.
            </p>
          </section>

          {/* 9. Contact */}
          <section>
            <h3 className="text-lg font-semibold text-white">9. Contact</h3>
            <p className="text-gray-400 leading-relaxed">
              If you have questions about these terms or need to report a violation, use the Send Feedback feature within the Platform or contact the site administrator.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-white/10 text-center">
          <p className="text-xs text-gray-500">&copy; {new Date().getFullYear()} XPIA Tools. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
