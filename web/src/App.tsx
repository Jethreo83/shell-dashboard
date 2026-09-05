import './theme.css';
import { useAuth, AuthProvider } from './auth';
import { Launcher } from './Launcher';

function LoginScreen() {
  const { error, loading } = useAuth();
  return (
    <div className="shell-login">
      <h1>Jocasta</h1>
      {loading && <p style={{ color: 'var(--shell-text-dim)' }}>Signing in…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div id="google-signin-button" />
    </div>
  );
}

function AppInner() {
  const { session, loading, error } = useAuth();
  return (
    <div className="shell-app">
      {loading && !session && <p>Signing in…</p>}
      {error && !session && <p role="alert">{error}</p>}
      {session ? <Launcher /> : <LoginScreen />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
