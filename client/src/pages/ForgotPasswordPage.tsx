import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Mail, ArrowLeft, MessageSquarePlus } from 'lucide-react';
import FeedbackModal from '../components/FeedbackModal';
import { useMaintenanceGuard } from '../hooks/useMaintenanceGuard';

export default function ForgotPasswordPage() {
  const maintenanceChecking = useMaintenanceGuard();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.auth.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-gray-900 to-brand-900 px-4">
      <div className={`w-full max-w-sm transition-opacity duration-200 ${maintenanceChecking ? 'opacity-0' : 'animate-fade-in'}`}>
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 backdrop-blur mb-4">
            <img src="/Xpia%20shield%20no%20background.png" alt="" className="w-9 h-9" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Reset Password</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/20">Beta</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">We&apos;ll generate a reset link for you</p>
        </div>

        <div className="card !bg-white/[0.03] !backdrop-blur-xl !border-white/10">
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label !text-gray-300">Email Address</label>
                <div className="relative">
                  <input
                    type="email"
                    className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500 pl-10"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                  <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          ) : (
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mx-auto">
                <Mail className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-sm text-gray-300">
                If an account exists for <span className="font-medium text-white">{email}</span>, a reset link has been generated.
              </p>
              <p className="text-xs text-gray-500">
                Check the server console for the reset link.
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to login
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
