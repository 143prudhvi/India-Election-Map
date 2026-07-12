import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import RequireAdmin from './auth/RequireAdmin.jsx';
import Login from './pages/Login.jsx';
import ForceChangePassword from './pages/ForceChangePassword.jsx';
import Explorer from './pages/Explorer.jsx';
import Profile from './pages/Profile.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminData from './pages/AdminData.jsx';
import ApiKeys from './pages/ApiKeys.jsx';
import Upgrade from './pages/Upgrade.jsx';
import PublicMap from './pages/PublicMap.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public, no-login routes (data only served when the server has
            PUBLIC_ACCESS_ENABLED=true) — outside the authed app chrome. */}
        <Route path="/m" element={<PublicMap />} />
        <Route path="/embed" element={<PublicMap embed />} />
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </AuthProvider>
  );
}

function navLinkClass({ isActive }) {
  return isActive ? 'nav-link active' : 'nav-link';
}

function Header({ minimal = false }) {
  const { user, logout } = useAuth();
  return (
    <header className="app-header">
      <div className="app-brand">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="app-title">India Election Map</span>
      </div>
      {!minimal && (
        <nav className="app-nav">
          <NavLink to="/" end className={navLinkClass}>
            Explorer
          </NavLink>
          <NavLink to="/profile" className={navLinkClass}>
            Profile
          </NavLink>
          <NavLink to="/api-keys" className={navLinkClass}>
            API Keys
          </NavLink>
          {user && user.role !== 'admin' && user.tier !== 'pro' && (
            <NavLink to="/upgrade" className={navLinkClass}>
              Upgrade
            </NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/admin/users" className={navLinkClass}>
              Admin Users
            </NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/admin/data" className={navLinkClass}>
              Data
            </NavLink>
          )}
        </nav>
      )}
      <div className="app-header-right">
        <span className="user-chip" title={user?.email}>
          {user?.display_name || user?.email}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="spinner-wrap spinner-page">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  // Inescapable gate: a user on a temporary password must change it before
  // anything else. Keep the header so they can still log out.
  if (user?.must_change_password) {
    return (
      <div className="app">
        <Header minimal />
        <main className="app-main">
          <ForceChangePassword />
        </main>
      </div>
    );
  }

  const showHeader = !!user && location.pathname !== '/login';

  return (
    <div className="app">
      {showHeader && <Header />}
      <main className="app-main">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Explorer />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAdmin>
                <AdminUsers />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/data"
            element={
              <RequireAdmin>
                <AdminData />
              </RequireAdmin>
            }
          />
          <Route
            path="/api-keys"
            element={
              <RequireAuth>
                <ApiKeys />
              </RequireAuth>
            }
          />
          <Route
            path="/upgrade"
            element={
              <RequireAuth>
                <Upgrade />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
