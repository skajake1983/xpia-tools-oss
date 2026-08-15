import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, MessageSquarePlus } from 'lucide-react';
import FeedbackModal from '../components/FeedbackModal';
import { useMaintenanceGuard } from '../hooks/useMaintenanceGuard';

export default function LoginPage() {
  const maintenanceChecking = useMaintenanceGuard();
  const { login, verify2FA } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.requires2FA && result.tempToken) {
        setNeeds2FA(true);
        setTempToken(result.tempToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await verify2FA(tempToken, totpCode, trustDevice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-gray-900 to-brand-900 px-4">
      <div className={`w-full max-w-sm transition-opacity duration-200 ${maintenanceChecking ? 'opacity-0' : 'animate-fade-in'}`}>
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 backdrop-blur mb-4">
            <img src="/Xpia%20shield%20no%20background.png" alt="" className="w-9 h-9" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">XPIA Tools</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/20">Beta</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">AI Security Research Toolkit</p>
        </div>

        <div className="card !bg-white/[0.03] !backdrop-blur-xl !border-white/10">
          {!needs2FA ? (
            <form onSubmit={handleLogin} className="space-y-4">
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
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handle2FA} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-sm text-gray-300">Enter the 6-digit code from your authenticator app</p>
              </div>
              <div>
                <input
                  type="text"
                  className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500 text-center text-2xl tracking-[0.3em] font-mono"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(e) => setTrustDevice(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-brand-500 focus:ring-brand-500/30"
                />
                <span className="text-sm text-gray-400">Trust this device for 30 days</span>
              </label>

              <button type="submit" className="btn-primary w-full" disabled={loading || totpCode.length !== 6}>
                {loading ? 'Verifying…' : 'Verify'}
              </button>
              <button
                type="button"
                onClick={() => { setNeeds2FA(false); setTotpCode(''); setError(''); }}
                className="btn-secondary w-full !bg-transparent !border-white/10 !text-gray-400"
              >
                Back to login
              </button>
            </form>
          )}

          <div className="mt-6 space-y-3">
            <Link to="/register" className="btn-secondary w-full !bg-transparent !border-white/10 !text-gray-300 hover:!text-white hover:!border-white/20 block text-center">
              Sign Up
            </Link>
            <Link to="/forgot-password" className="block text-sm text-gray-400 hover:text-gray-300 transition-colors text-center">
              Forgot your password?
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
