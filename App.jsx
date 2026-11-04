import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout.jsx";
import { ProtectedRoute } from "./components/ProtectedRoute.jsx";
import { useAuth } from "./auth/useAuth.js";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { RecordsPage } from "./pages/RecordsPage.jsx";
import { UsersPage } from "./pages/UsersPage.jsx";
import "./App.css";

function RoleDashboard({ role }) {
  return (
    <ProtectedRoute allowedRoles={[role]}>
      <AppLayout>
        <DashboardPage role={role} />
      </AppLayout>
    </ProtectedRoute>
  );
}

function RecordsRoute({ type }) {
  return (
    <ProtectedRoute>
      <AppLayout>
        <RecordsPage type={type} />
      </AppLayout>
    </ProtectedRoute>
  );
}

function AdminUsersRoute() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AppLayout>
        <UsersPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function HomeRedirect() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const rolePath = {
    admin: "/admin",
    teacher: "/teacher",
    student: "/student",
  }[user.role];

  return <Navigate to={rolePath || "/login"} replace />;
}

function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">404 - Page not found</span>
      <h1>This page is not in your campus map.</h1>
      <a className="button button-primary" href="/">
        Return to home
      </a>
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin" element={<RoleDashboard role="admin" />} />
      <Route path="/teacher" element={<RoleDashboard role="teacher" />} />
      <Route path="/student" element={<RoleDashboard role="student" />} />
      <Route path="/departments" element={<RecordsRoute type="departments" />} />
      <Route path="/courses" element={<RecordsRoute type="courses" />} />
      <Route path="/users" element={<AdminUsersRoute />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
