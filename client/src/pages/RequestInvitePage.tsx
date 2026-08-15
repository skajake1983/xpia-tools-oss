import { useState, FormEvent, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Send, RefreshCw, CheckCircle, MessageSquarePlus } from 'lucide-react';
import { api } from '../lib/api';
import FeedbackModal from '../components/FeedbackModal';

export default function RequestInvitePage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const loadCaptcha = async () => {
    try {
      const { id, question } = await api.inviteRequests.getCaptcha();
      setCaptchaId(id);
      setCaptchaQuestion(question);
      setCaptchaAnswer('');
    } catch {
      setError('Failed to load CAPTCHA');
    }
  };

  useEffect(() => { loadCaptcha(); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.inviteRequests.submit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        organization: organization.trim(),
        jobTitle: jobTitle.trim(),
        captchaId,
        captchaAnswer: captchaAnswer.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
      await loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-gray-900 to-brand-900 px-4">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-green-600/20 backdrop-blur mb-4">
              <CheckCircle className="w-7 h-7 text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Request Submitted</h1>
            <p className="text-sm text-gray-400 mt-2 text-center leading-relaxed">
              Your invite request has been submitted. An administrator will review it and you'll receive an invite code at <span className="text-white font-medium">{email}</span> once approved.
            </p>
          </div>
          <div className="text-center">
            <Link to="/login" className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-gray-900 to-brand-900 px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 backdrop-blur mb-4">
            <Shield className="w-7 h-7 text-brand-400" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Request an Invite</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/20">Beta</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">Fill out the form below to request access to XPIA Tools</p>
        </div>

        <div className="card !bg-white/[0.03] !backdrop-blur-xl !border-white/10">
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <label className="label !text-gray-300">Email</label>
              <input
                type="email"
                className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
              />
            </div>

            <div>
              <label className="label !text-gray-300">Organization</label>
              <input
                type="text"
                className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500"
                placeholder="Acme Security Inc."
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                required
                maxLength={200}
              />
            </div>

            <div>
              <label className="label !text-gray-300">Job Title</label>
              <input
                type="text"
                className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500"
                placeholder="Security Researcher, Pen Tester, etc."
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                required
                maxLength={200}
              />
            </div>

            <hr className="border-white/10" />

            {/* CAPTCHA */}
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

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={loading || !firstName || !lastName || !email || !organization || !jobTitle || !captchaAnswer}
            >
              <Send className="w-4 h-4" />
              {loading ? 'Submitting…' : 'Submit Request'}
            </button>
          </form>

          <div className="mt-6 space-y-3">
            <Link to="/login" className="btn-secondary w-full !bg-transparent !border-white/10 !text-gray-300 hover:!text-white hover:!border-white/20 block text-center">
              Sign In
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setFeedbackOpen(true)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Send Feedback
          </button>
          <span className="text-gray-600">·</span>
          <Link to="/terms" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            Terms of Use
          </Link>
        </div>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} variant="dark" />
    </div>
  );
}
