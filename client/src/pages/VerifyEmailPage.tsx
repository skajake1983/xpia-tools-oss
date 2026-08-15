import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Mail, Loader2, CheckCircle, X } from 'lucide-react';

export default function VerifyEmailPage() {
  const { user, refreshUser, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setVerifying(true);
    setError('');
    api.auth.verifyEmail(token)
      .then(async () => {
        setVerified(true);
        if (user) {
          await refreshUser();
        } else {
          // Not logged in — redirect to login after a brief delay
          setTimeout(() => navigate('/login', { replace: true }), 2000);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Verification failed');
      })
      .finally(() => setVerifying(false));
  }, [token, refreshUser]);

  const handleResend = async () => {
    setResending(true);
    setResent(false);
    setError('');
    try {
      await api.auth.resendVerification();
      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-gray-900 to-brand-900 px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 backdrop-blur mb-4">
            {verified ? (
              <CheckCircle className="w-7 h-7 text-green-400" />
            ) : (
              <Mail className="w-7 h-7 text-brand-400" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {verified ? 'Email Verified!' : 'Verify Your Email'}
          </h1>
          {!verified && !verifying && (
            <p className="text-sm text-gray-400 mt-1 text-center">
              We sent a verification link to{' '}
              <span className="font-medium text-gray-300">{user?.email}</span>
            </p>
          )}
        </div>

        <div className="card !bg-white/[0.03] !backdrop-blur-xl !border-white/10">
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
              <X className="w-4 h-4 flex-shrink-0" /> {error}
            </p>
          )}

          {verifying && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
              <p className="text-sm text-gray-400">Verifying your email…</p>
            </div>
          )}

          {verified && (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-green-400">Your email has been verified. Redirecting…</p>
            </div>
          )}

          {!verifying && !verified && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-400 leading-relaxed">
                Check your inbox and click the verification link to continue. The link expires in 24 hours.
              </p>

              {resent && (
                <p className="text-sm text-green-400 bg-green-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" /> Verification email sent!
                </p>
              )}

              {user ? (
                <>
                  <button
                    onClick={handleResend}
                    disabled={resending}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {resending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        Resend Verification Email
                      </>
                    )}
                  </button>

                  <button
                    onClick={logout}
                    className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  onClick={() => navigate('/login', { replace: true })}
                  className="btn-primary w-full"
                >
                  Go to Login
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
