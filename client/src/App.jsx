import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import RequireAdmin from './auth/RequireAdmin.jsx';
import Login from './pages/Login.jsx';
import ForceChangePassword from './pages/ForceChangePassword.jsx';
import Explorer from './pages/Explorer.jsx';
import Profile from './pages/Profile.jsx';
import AdminUsers from './pages/AdminUsers.jsx';

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
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
      <div className="app-title">India Election Map</div>
      {!minimal && (
        <nav className="app-nav">
          <NavLink to="/" end className={navLinkClass}>
            Explorer
          </NavLink>
          <NavLink to="/profile" className={navLinkClass}>
            Profile
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/admin/users" className={navLinkClass}>
              Admin Users
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
