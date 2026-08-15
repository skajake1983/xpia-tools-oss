import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { ShieldCheck, Loader2, Check, X } from 'lucide-react';

export default function Setup2FAPage() {
  const { refreshUser, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState('');

  const handleStart = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await api.auth.setup2FA();
      setSetupData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setError('');
    setLoading(true);
    try {
      await api.auth.confirm2FA(confirmCode);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-gray-900 to-brand-900 px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600/20 backdrop-blur mb-4">
            <ShieldCheck className="w-7 h-7 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Set Up 2FA</h1>
          <p className="text-sm text-gray-400 mt-1">Two-factor authentication is required to use XPIA Tools</p>
        </div>

        <div className="card !bg-white/[0.03] !backdrop-blur-xl !border-white/10">
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2 mb-4 flex items-center gap-2">
              <X className="w-4 h-4 flex-shrink-0" /> {error}
            </p>
          )}

          {!setupData ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-300 leading-relaxed">
                For the security of this platform and its research tools, all accounts must enable two-factor authentication before accessing any features.
              </p>
              <p className="text-sm text-gray-400">
                You'll need an authenticator app like Google Authenticator, Authy, or 1Password.
              </p>
              <button onClick={handleStart} className="btn-primary w-full" disabled={loading}>
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</> : 'Begin 2FA Setup'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">Scan this QR code with your authenticator app:</p>
              <div className="flex justify-center">
                <img src={setupData.qrCodeUrl} alt="2FA QR Code" className="rounded-xl shadow-sm" />
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Or enter this secret manually:</p>
                <code className="text-sm font-mono bg-white/5 px-3 py-1.5 rounded-lg text-brand-400 select-all">
                  {setupData.secret}
                </code>
              </div>
              <div>
                <label className="label !text-gray-300">Verification Code</label>
                <input
                  type="text"
                  className="input !bg-white/5 !border-white/10 !text-white text-center font-mono text-lg tracking-widest"
                  placeholder="000000"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  autoFocus
                />
              </div>
              <button
                onClick={handleConfirm}
                className="btn-primary w-full"
                disabled={loading || confirmCode.length !== 6}
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : <><Check className="w-4 h-4" /> Verify & Enable 2FA</>}
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-400 transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
