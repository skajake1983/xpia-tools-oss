import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import Setup2FAPage from './pages/Setup2FAPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import ImagesPage from './pages/ImagesPage';
import PayloadsPage from './pages/PayloadsPage';
import PagesPage from './pages/PagesPage';
import SettingsPage from './pages/SettingsPage';
import HelpPage from './pages/HelpPage';
import PublicHelpPage from './pages/PublicHelpPage';
import RoePage from './pages/RoePage';
import UsagePage from './pages/UsagePage';
import PromptTemplatesPage from './pages/PromptTemplatesPage';
import AdminPage from './pages/AdminPage';
import TermsPage from './pages/TermsPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import MaintenancePage from './pages/MaintenancePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/login" replace />;

  // Force email verification before allowing access
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;

  // Force 2FA setup before allowing access
  if (!user.totpEnabled) return <Navigate to="/setup-2fa" replace />;

  // Force password change after forgot-password reset
  if (user.forcePasswordChange) return <Navigate to="/change-password" replace />;

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.isAdmin) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function MaintenanceRoute() {
  const [params] = useSearchParams();
  return <MaintenancePage message={params.get('message') || undefined} endsAt={params.get('endsAt') || undefined} />;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      {/* Public routes — always accessible */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/help" element={<PublicHelpPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/maintenance" element={<MaintenanceRoute />} />
      <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/app" replace /> : <RegisterPage />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/app" replace /> : <ForgotPasswordPage />} />
      <Route path="/reset-password" element={user ? <Navigate to="/app" replace /> : <ResetPasswordPage />} />
      <Route
        path="/verify-email"
        element={
          loading ? null
          : user?.emailVerified ? <Navigate to="/app" replace />
          : <VerifyEmailPage />
        }
      />
      <Route
        path="/setup-2fa"
        element={
          loading ? null
          : !user ? <Navigate to="/login" replace />
          : user.totpEnabled ? <Navigate to="/app" replace />
          : <Setup2FAPage />
        }
      />
      <Route
        path="/change-password"
        element={
          loading ? null
          : !user ? <Navigate to="/login" replace />
          : !user.forcePasswordChange ? <Navigate to="/app" replace />
          : <ChangePasswordPage />
        }
      />

      {/* Authenticated app shell */}
      <Route
        path="/app"
        element={
          loading ? (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Loading XPIA Tools…</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">Beta</span>
                </div>
              </div>
            </div>
          ) : (
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          )
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="images" element={<ImagesPage />} />
        <Route path="payloads" element={<PayloadsPage />} />
        <Route path="pages" element={<PagesPage />} />
        <Route path="prompt-templates" element={<PromptTemplatesPage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="roe" element={<RoePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
