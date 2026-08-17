import { useState, FormEvent, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Check, X, Linkedin, Ticket, RefreshCw, MessageSquarePlus } from 'lucide-react';
import { PASSWORD_RULES, validatePassword } from '../../../shared/password-rules';
import { useMaintenanceGuard } from '../hooks/useMaintenanceGuard';
import FeedbackModal from '../components/FeedbackModal';
import { api } from '../lib/api';

const LINKEDIN_RE = /^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/;

export default function RegisterPage() {
  const maintenanceChecking = useMaintenanceGuard();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [organization, setOrganization] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaId, setCaptchaId] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [inviteRequired, setInviteRequired] = useState<boolean | null>(null);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lookupInviteCode = useCallback(async (code: string) => {
    if (code.length < 4) return;
    try {
      const info = await api.auth.lookupInviteCode(code);
      if (info.email) setEmail(info.email);
      if (info.firstName) setFirstName(info.firstName);
      if (info.lastName) setLastName(info.lastName);
      if (info.organization) setOrganization(info.organization);
      if (info.jobTitle) setJobTitle(info.jobTitle);
      setPrefilled(true);
    } catch {
      // Code not found or expired — user fills manually
    }
  }, []);

  const handleInviteCodeChange = (value: string) => {
    const formatted = value.toUpperCase().slice(0, 20);
    setInviteCode(formatted);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (formatted.length >= 4) {
      lookupTimer.current = setTimeout(() => lookupInviteCode(formatted), 500);
    }
  };

  const loadCaptcha = async () => {
    try {
      const { id, question } = await api.auth.getCaptcha();
      setCaptchaId(id);
      setCaptchaQuestion(question);
      setCaptchaAnswer('');
    } catch {
      setError('Failed to load verification challenge');
    }
  };

  useEffect(() => {
    loadCaptcha();
    api.auth.getRegistrationSettings()
      .then(({ requireInviteCode }) => setInviteRequired(requireInviteCode))
      .catch(() => { /* default to required */ });
  }, []);

  const passwordCheck = useMemo(() => validatePassword(password), [password]);
  const linkedinValid = !linkedinUrl || LINKEDIN_RE.test(linkedinUrl);

  const allFieldsFilled = email && firstName && lastName && (!inviteRequired || inviteCode) && inviteRequired !== null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!passwordCheck.valid) {
      setError('Password does not meet complexity requirements');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (linkedinUrl && !LINKEDIN_RE.test(linkedinUrl)) {
      setError('Please enter a valid LinkedIn profile URL (e.g., https://linkedin.com/in/yourname)');
      return;
    }

    if (inviteRequired && !inviteCode.trim()) {
      setError('An invite code is required to register');
      return;
    }

    setLoading(true);
    try {
      await register({ email, password, firstName: firstName.trim(), lastName: lastName.trim(), organization: organization.trim() || undefined, jobTitle: jobTitle.trim() || undefined, linkedinUrl: linkedinUrl.trim() || undefined, inviteCode: inviteCode.trim() || undefined, captchaId, captchaAnswer: captchaAnswer.trim(), termsAcceptedAt: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      await loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-gray-900 to-brand-900 px-4 py-12">
      <div className={`w-full max-w-md transition-opacity duration-200 ${maintenanceChecking || inviteRequired === null ? 'opacity-0' : 'animate-fade-in'}`}>
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 backdrop-blur mb-4">
            <img src="/Xpia%20shield%20no%20background.png" alt="" className="w-9 h-9" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Create Account</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/20">Beta</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">Join XPIA Tools</p>
        </div>

        <div className="card !bg-white/[0.03] !backdrop-blur-xl !border-white/10">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Invite Code — first, it's the gate */}
            {inviteRequired && (
            <div>
              <label className="label !text-gray-300">
                <span className="flex items-center gap-1.5"><Ticket className="w-3.5 h-3.5" /> Invite Code</span>
              </label>
              <input
                type="text"
                className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500 font-mono tracking-widest uppercase text-center"
                placeholder="XXXXXXXX"
                value={inviteCode}
                onChange={(e) => handleInviteCodeChange(e.target.value)}
                required
                maxLength={20}
              />
            </div>
            )}

            {inviteRequired && <hr className="border-white/10" />}

            {prefilled && (
              <p className="text-xs text-green-400/80 bg-green-500/10 rounded-lg px-3 py-2">
                Fields pre-filled from your invite request. You can still edit them if needed.
              </p>
            )}

            {/* Name row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label !text-gray-300">First Name</label>
                <input
                  type="text"
                  className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500"
                  placeholder="Jane"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div>
                <label className="label !text-gray-300">Last Name</label>
                <input
                  type="text"
                  className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
            </div>

            <div>
              <label className="label !text-gray-300">Organization <span className="text-gray-500 font-normal">(optional)</span></label>
              <input
                type="text"
                className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500"
                placeholder="Acme Security Inc."
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                maxLength={200}
              />
            </div>

            <div>
              <label className="label !text-gray-300">Job Title <span className="text-gray-500 font-normal">(optional)</span></label>
              <input
                type="text"
                className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500"
                placeholder="Security Researcher, Pen Tester, etc."
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                maxLength={200}
              />
            </div>

            <div>
              <label className="label !text-gray-300">
                <span className="flex items-center gap-1.5"><Linkedin className="w-3.5 h-3.5" /> LinkedIn Profile URL <span className="text-gray-500 font-normal">(optional)</span></span>
              </label>
              <input
                type="url"
                className={`input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500 ${
                  linkedinUrl && !linkedinValid ? '!border-red-500/50' : ''
                }`}
                placeholder="https://linkedin.com/in/yourname"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                maxLength={500}
              />
              {linkedinUrl && !linkedinValid && (
                <p className="text-xs text-red-400 mt-1">Must be a valid LinkedIn profile URL</p>
              )}
            </div>

            <hr className="border-white/10" />

            <div>
              <label className="label !text-gray-300">Email</label>
              <input
                type="email"
                className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label !text-gray-300">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500 pr-10"
                  placeholder="Min 12 chars, mixed case, number, symbol"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && (
                <ul className="mt-2 space-y-1">
                  {PASSWORD_RULES.map((rule) => {
                    const pass = rule.test(password);
                    return (
                      <li key={rule.id} className={`flex items-center gap-1.5 text-xs ${pass ? 'text-green-400' : 'text-gray-500'}`}>
                        {pass ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div>
              <label className="label !text-gray-300">Confirm Password</label>
              <input
                type="password"
                className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <hr className="border-white/10" />

            {/* Verification */}
            <div>
              <label className="label !text-gray-300">Verification</label>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-base font-medium text-white bg-white/10 px-4 py-2 rounded-lg">
                  {captchaQuestion || 'Loading…'}
                </span>
                <button
                  type="button"
                  onClick={loadCaptcha}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors"
                  title="New question"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500 w-32"
                placeholder="Answer"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                required
                maxLength={20}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <label className="flex items-start gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 accent-brand-500"
              />
              <span>
                I agree to the{' '}
                <Link to="/terms" target="_blank" className="text-brand-400 hover:text-brand-300 underline">
                  Terms of Use & Acceptable Use Policy
                </Link>
              </span>
            </label>

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading || !passwordCheck.valid || !allFieldsFilled || !linkedinValid || !captchaAnswer || !termsAccepted}
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>

            <p className="text-xs text-gray-500 text-center leading-relaxed">
              2FA setup is required after registration. Have your authenticator app ready.
            </p>
          </form>

          <div className="mt-6 space-y-3">
            <Link to="/login" className="btn-secondary w-full !bg-transparent !border-white/10 !text-gray-300 hover:!text-white hover:!border-white/20 block text-center">
              Sign In
            </Link>
          </div>
        </div>

        <button
          onClick={() => setFeedbackOpen(true)}
          className="flex items-center justify-center gap-1.5 mt-6 text-sm text-gray-500 hover:text-gray-300 transition-colors mx-auto"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" />
          Send Feedback
        </button>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} variant="dark" />
    </div>
  );
}
