import { useAuth, AuthProvider } from './auth';
import { Launcher } from './Launcher';

function LoginScreen() {
  return (
    <div>
      <h1>Shell</h1>
      <div id="google-signin-button" />
    </div>
  );
}

function AppInner() {
  const { session, loading, error } = useAuth();
  return (
    <div>
      {loading && <p>Signing in…</p>}
      {error && <p role="alert">{error}</p>}
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
