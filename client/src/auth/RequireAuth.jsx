import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="spinner-wrap">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }
  // Remember where the user was headed so Login can return them there.
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
