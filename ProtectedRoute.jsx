import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";

export function ProtectedRoute({ allowedRoles, children }) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    const rolePath = {
      admin: "/admin",
      teacher: "/teacher",
      student: "/student",
    }[user?.role];
    return <Navigate to={rolePath || "/login"} replace />;
  }

  return children;
}
