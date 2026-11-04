import { useState } from "react";
import { ArrowRight, Eye, EyeOff, GraduationCap, ShieldCheck } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";

const ROLE_HOME = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
};

const LOGIN_ROLES = [
  { value: "admin", label: "Admin Login" },
  { value: "teacher", label: "Teacher Login" },
  { value: "student", label: "Student Login" },
];

export function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedRole, setSelectedRole] = useState("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated) {
    return <Navigate to={ROLE_HOME[user?.role] || "/"} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const authenticatedUser = await login(
        email.trim(),
        password,
        selectedRole,
      );
      const destination =
        location.state?.from?.pathname ||
        ROLE_HOME[authenticatedUser.role] ||
        "/";
      navigate(destination, { replace: true });
    } catch (loginError) {
      setError(
        loginError instanceof ApiError
          ? loginError.status === 401
            ? "The email or password you entered is incorrect."
            : loginError.status === 403
              ? "Choose the login option assigned to your account."
              : loginError.message
          : loginError.message || "Sign in could not be completed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand">
          <span className="brand-mark brand-mark-light">
            <GraduationCap size={23} strokeWidth={2.2} />
          </span>
          <span>CampusFlow</span>
        </div>
        <div className="story-content">
          <span className="story-kicker">
            <span className="kicker-line" />
            DEPARTMENT MANAGEMENT SYSTEM
          </span>
          <h1>
            Your campus,
            <br />
            <span>in sync.</span>
          </h1>
          <p>
            A clearer view of departments, courses, and the people who make
            learning happen.
          </p>
          <div className="story-art" aria-hidden="true">
            <div className="art-glow" />
            <div className="art-grid" />
            <div className="art-card art-card-main">
              <div className="art-card-top">
                <span className="art-dot" />
                <span className="art-line art-line-short" />
                <span className="art-menu">•••</span>
              </div>
              <div className="art-chart">
                <div className="chart-labels">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="chart-bars">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="art-card-bottom">
                <span className="art-line" />
                <span className="art-line art-line-tiny" />
              </div>
            </div>
            <div className="art-float art-float-one">
              <span className="float-icon float-purple">
                <GraduationCap size={16} />
              </span>
              <span>
                <i />
                <i />
              </span>
              <b />
            </div>
            <div className="art-float art-float-two">
              <span className="float-icon float-green">
                <ShieldCheck size={16} />
              </span>
              <span>
                <i />
                <i />
              </span>
            </div>
          </div>
        </div>
        <div className="story-footer">
          <span>Designed for your academic community</span>
          <span>© 2026 CampusFlow</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="login-mobile-brand">
            <span className="brand-mark">
              <GraduationCap size={21} />
            </span>
            <strong>CampusFlow</strong>
          </div>
          <div className="login-heading">
            <span className="eyebrow">WELCOME BACK</span>
            <h2>Sign in to your account</h2>
            <p>Enter your university account details to continue.</p>
          </div>

          {location.state?.logoutWarning && (
            <p className="form-error" role="status">
              {location.state.logoutWarning}
            </p>
          )}

          <form className="login-form" onSubmit={handleSubmit}>
            <fieldset className="login-role-options" disabled={loading}>
              <legend>Choose your account type</legend>
              <div className="login-role-buttons">
                {LOGIN_ROLES.map(({ value, label }) => (
                  <button
                    key={value}
                    className={
                      selectedRole === value
                        ? "login-role-button login-role-button-active"
                        : "login-role-button"
                    }
                    type="button"
                    aria-pressed={selectedRole === value}
                    onClick={() => setSelectedRole(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="name@university.edu"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={loading}
            />

            <div className="password-label-row">
              <label htmlFor="password">Password</label>
            </div>
            <div className="password-input-wrap">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && (
              <div className="form-error" role="alert">
                <span className="error-mark">!</span>
                {error}
              </div>
            )}

            <button
              className="button button-primary login-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          <div className="secure-note">
            <ShieldCheck size={17} />
            <span>Your account is protected with secure authentication.</span>
          </div>
          <p className="login-help">
            Need access? Contact your department administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
