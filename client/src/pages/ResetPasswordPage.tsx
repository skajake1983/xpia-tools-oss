import { useState, FormEvent, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle, Check, X } from 'lucide-react';
import { PASSWORD_RULES, validatePassword } from '../../../shared/password-rules';
import { useMaintenanceGuard } from '../hooks/useMaintenanceGuard';

export default function ResetPasswordPage() {
  const maintenanceChecking = useMaintenanceGuard();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordsMatch = password === confirmPassword;
  const passwordCheck = useMemo(() => validatePassword(password), [password]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passwordsMatch || !passwordCheck.valid) return;

    setError('');
    setLoading(true);

    try {
      await api.auth.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-gray-900 to-brand-900 px-4">
        <div className={`w-full max-w-sm transition-opacity duration-200 ${maintenanceChecking ? 'opacity-0' : 'animate-fade-in'} text-center`}>
          <div className="card !bg-white/[0.03] !backdrop-blur-xl !border-white/10 space-y-4">
            <p className="text-sm text-red-400">Invalid reset link — no token provided.</p>
            <Link
              to="/forgot-password"
              className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-gray-900 to-brand-900 px-4">
      <div className={`w-full max-w-sm transition-opacity duration-200 ${maintenanceChecking ? 'opacity-0' : 'animate-fade-in'}`}>
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 backdrop-blur mb-4">
            <img src="/Xpia%20shield%20no%20background.png" alt="" className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">New Password</h1>
          <p className="text-sm text-gray-400 mt-1">Choose a strong password for your account</p>
        </div>

        <div className="card !bg-white/[0.03] !backdrop-blur-xl !border-white/10">
          {!success ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label !text-gray-300">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500 pl-10 pr-10"
                    placeholder="Min 12 chars, mixed case, number, symbol"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={12}
                    autoComplete="new-password"
                    autoFocus
                  />
                  <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
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
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500 pl-10"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={loading || !passwordCheck.valid || !passwordsMatch}
              >
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>
          ) : (
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mx-auto">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <p className="text-sm text-gray-300">
                Your password has been reset successfully.
              </p>
              <p className="text-xs text-gray-500">Redirecting to login…</p>
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
      </div>
    </div>
  );
}
