import { Navigate, useLocation } from 'react-router-dom';
import { getIdToken } from '../services/api';

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = getIdToken();

  if (!token || token === 'guest-offline-token') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
