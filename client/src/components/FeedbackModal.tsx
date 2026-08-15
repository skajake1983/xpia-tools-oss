import { useState, useEffect, useCallback, FormEvent } from 'react';
import { X, MessageSquarePlus, Bug, Lightbulb, MessageCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { api, getLastCorrelationId } from '../lib/api';

const TYPES = [
  { value: 'bug' as const, label: 'Bug Report', icon: Bug, color: 'text-red-400' },
  { value: 'feature' as const, label: 'Feature Request', icon: Lightbulb, color: 'text-amber-400' },
  { value: 'feedback' as const, label: 'General Feedback', icon: MessageCircle, color: 'text-brand-400' },
];

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  /** If provided, user is authenticated — name/email auto-populated */
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;
  /** Style variant — 'dark' for auth pages (dark bg), 'light' for in-app */
  variant?: 'dark' | 'light';
}

export default function FeedbackModal({ open, onClose, userEmail, userFirstName, userLastName, variant = 'light' }: FeedbackModalProps) {
  const isAuthenticated = !!userEmail;
  const [type, setType] = useState<'bug' | 'feature' | 'feedback'>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [captchaId, setCaptchaId] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  const needsCaptcha = !isAuthenticated;

  // Auto-dismiss validation errors after 4 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const loadCaptcha = useCallback(async () => {
    try {
      const { id, question } = await api.feedback.getCaptcha();
      setCaptchaId(id);
      setCaptchaQuestion(question);
      setCaptchaAnswer('');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open && needsCaptcha) loadCaptcha();
  }, [open, needsCaptcha, loadCaptcha]);

  if (!open) return null;

  const isDark = variant === 'dark';

  const reset = () => {
    setType('bug');
    setTitle('');
    setDescription('');
    setFirstName('');
    setLastName('');
    setEmail('');
    setError('');
    setSubmitted(false);
    setCaptchaId('');
    setCaptchaQuestion('');
    setCaptchaAnswer('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const resolvedFirst = isAuthenticated ? (userFirstName || '') : firstName.trim();
    const resolvedLast = isAuthenticated ? (userLastName || '') : lastName.trim();
    const resolvedEmail = isAuthenticated ? userEmail! : email.trim();

    if (!resolvedFirst || !resolvedLast) {
      setError('First and last name are required.');
      return;
    }
    if (!resolvedEmail) {
      setError('Email is required.');
      return;
    }
    if (!title.trim() || title.trim().length < 3) {
      setError('Title must be at least 3 characters.');
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      setError('Description must be at least 10 characters.');
      return;
    }
    if (needsCaptcha && !captchaAnswer.trim()) {
      setError('Please answer the verification question.');
      return;
    }

    setLoading(true);

    try {
      await api.feedback.submit({
        type,
        title,
        description,
        firstName: resolvedFirst,
        lastName: resolvedLast,
        email: resolvedEmail,
        ...(type === 'bug' ? { correlationId: getLastCorrelationId() || undefined } : {}),
        ...(needsCaptcha ? { captchaId, captchaAnswer: captchaAnswer.trim() } : {}),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
      if (needsCaptcha) loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  // Conditional classes based on variant
  const overlayClass = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4';
  const panelClass = isDark
    ? 'w-full max-w-md rounded-2xl bg-gray-900/95 border border-white/10 shadow-2xl'
    : 'w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl';
  const headerText = isDark ? 'text-white' : 'text-gray-900 dark:text-white';
  const labelText = isDark ? 'text-gray-300' : 'text-gray-700 dark:text-gray-300';
  const inputClass = isDark
    ? 'input !bg-white/5 !border-white/10 !text-white !placeholder-gray-500'
    : 'input';
  const subtleText = isDark ? 'text-gray-400' : 'text-gray-500 dark:text-gray-400';

  return (
    <div className={overlayClass} onClick={handleClose}>
      <div className={panelClass} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800" style={isDark ? { borderColor: 'rgba(255,255,255,0.1)' } : {}}>
          <div className="flex items-center gap-2.5">
            <MessageSquarePlus className="w-5 h-5 text-brand-500" />
            <h2 className={`text-lg font-semibold ${headerText}`}>Send Feedback</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h3 className={`text-lg font-semibold mb-1 ${headerText}`}>Thank you!</h3>
            <p className={`text-sm ${subtleText}`}>Your feedback has been submitted successfully.</p>
            <button onClick={handleClose} className="btn-primary mt-6">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
            {/* Type selector */}
            <div>
              <label className={`label ${labelText}`}>Type</label>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                      type === t.value
                        ? isDark
                          ? 'border-brand-500/50 bg-brand-500/10 text-brand-300'
                          : 'border-brand-500/50 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                        : isDark
                          ? 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <t.icon className={`w-4 h-4 ${type === t.value ? t.color : ''}`} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className={`label ${labelText}`}>Title</label>
              <input
                type="text"
                className={inputClass}
                placeholder="Brief summary…"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setError(''); }}
                maxLength={200}
              />
            </div>

            {/* Description */}
            <div>
              <label className={`label ${labelText}`}>Description</label>
              <textarea
                className={`${inputClass} min-h-[100px] resize-y`}
                placeholder="Describe the issue or suggestion in detail…"
                value={description}
                onChange={(e) => { setDescription(e.target.value); setError(''); }}
                maxLength={5000}
              />
            </div>

            {/* Name & email — only shown for unauthenticated users */}
            {!isAuthenticated && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`label ${labelText}`}>First Name</label>
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="First name"
                      value={firstName}
                      onChange={(e) => { setFirstName(e.target.value); setError(''); }}
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <label className={`label ${labelText}`}>Last Name</label>
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="Last name"
                      value={lastName}
                      onChange={(e) => { setLastName(e.target.value); setError(''); }}
                      maxLength={100}
                    />
                  </div>
                </div>
                <div>
                  <label className={`label ${labelText}`}>Email</label>
                  <input
                    type="email"
                    className={inputClass}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  />
                </div>
              </>
            )}

            {/* Captcha — only for unauthenticated users */}
            {needsCaptcha && (
              <div>
                <label className={`label ${labelText}`}>Verification</label>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-sm font-medium px-3 py-1.5 rounded-lg ${isDark ? 'text-white bg-white/10' : 'text-gray-900 bg-gray-100 dark:text-white dark:bg-white/10'}`}>
                    {captchaQuestion || 'Loading…'}
                  </span>
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-white/10' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-white/10'}`}
                    title="New question"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  className={`${inputClass} w-32`}
                  placeholder="Answer"
                  value={captchaAnswer}
                  onChange={(e) => { setCaptchaAnswer(e.target.value); setError(''); }}
                  maxLength={20}
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading || (needsCaptcha && !captchaAnswer.trim())}>
              {loading ? 'Submitting…' : 'Submit Feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
