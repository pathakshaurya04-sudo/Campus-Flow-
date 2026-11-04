import { useState } from "react";
import {
  BookOpen,
  Building2,
  ChevronDown,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";

const ROLE_HOME = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
};

const ROLE_LABELS = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
};

const NAV_ITEMS = {
  admin: [
    { to: "/admin", label: "Overview", icon: LayoutDashboard },
    { to: "/users", label: "Users", icon: Users },
    { to: "/departments", label: "Departments", icon: Building2 },
    { to: "/courses", label: "Courses", icon: BookOpen },
  ],
  teacher: [
    { to: "/teacher", label: "Overview", icon: LayoutDashboard },
    { to: "/courses", label: "Courses", icon: BookOpen },
    { to: "/departments", label: "Departments", icon: Building2 },
  ],
  student: [
    { to: "/student", label: "Overview", icon: LayoutDashboard },
    { to: "/courses", label: "Courses", icon: BookOpen },
    { to: "/departments", label: "Departments", icon: Building2 },
  ],
};

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function pageTitle(pathname) {
  if (pathname === "/users") return "Users";
  if (pathname === "/departments") return "Departments";
  if (pathname === "/courses") return "Courses";
  return "Overview";
}

export function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = NAV_ITEMS[user?.role] || [];

  async function handleLogout() {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      navigate("/login", {
        replace: true,
        state: {
          logoutWarning:
            "You were signed out on this device, but server-side token revocation could not be confirmed.",
        },
      });
    }
  }

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <GraduationCap size={22} strokeWidth={2.2} />
          </div>
          <div>
            <strong>CampusFlow</strong>
            <span>Department portal</span>
          </div>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-symbol">U</div>
          <div className="workspace-copy">
            <span>Workspace</span>
            <strong>University</strong>
          </div>
          <ChevronDown size={16} className="muted-icon" />
        </div>

        <div className="nav-section-label">Workspace</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === ROLE_HOME[user?.role]}
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-link-active" : ""}`
              }
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>
              {to === "/courses" && location.pathname === "/courses" && (
                <span className="nav-current-dot" />
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="support-card">
            <div className="support-avatar">?</div>
            <div>
              <strong>Need a hand?</strong>
              <span>Your campus portal, in one place.</span>
            </div>
          </div>
          <div className="sidebar-version">DEPARTMENT MANAGEMENT SYSTEM</div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{pageTitle(location.pathname)}</strong>
          </div>
          <div className="topbar-right">
            <div className="topbar-divider" />
            <div className="profile-block">
              <div className="avatar">{initials(user?.full_name)}</div>
              <div className="profile-copy">
                <strong>{user?.full_name || "Campus user"}</strong>
                <span>{ROLE_LABELS[user?.role] || "Member"}</span>
              </div>
            </div>
            <button
              className="logout-button"
              type="button"
              onClick={handleLogout}
              title="Log out"
            >
              <LogOut size={17} />
              <span>Log out</span>
            </button>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
