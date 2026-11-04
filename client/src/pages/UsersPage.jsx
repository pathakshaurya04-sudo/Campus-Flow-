import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plus, RefreshCw, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client.js";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  password: "",
  role: "teacher",
  department_id: "",
  phone: "",
};

const ROLE_LABELS = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
};

export function UsersPage() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roleChanges, setRoleChanges] = useState({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [userResult, departmentResult] = await Promise.all([
        apiRequest("/api/users"),
        apiRequest("/api/departments"),
      ]);
      setUsers(userResult.users || []);
      setDepartments(departmentResult.departments || []);
      setRoleChanges(
        Object.fromEntries(
          (userResult.users || []).map((user) => [user.user_id, user.role]),
        ),
      );
    } catch (loadError) {
      setError(loadError.message || "Users could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest("/api/users"),
      apiRequest("/api/departments"),
    ])
      .then(([userResult, departmentResult]) => {
        if (!active) return;
        const loadedUsers = userResult.users || [];
        setUsers(loadedUsers);
        setDepartments(departmentResult.departments || []);
        setRoleChanges(
          Object.fromEntries(
            loadedUsers.map((user) => [user.user_id, user.role]),
          ),
        );
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError.message || "Users could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function updateForm(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function createUser(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiRequest("/api/users", {
        method: "POST",
        body: {
          ...form,
          phone: form.phone.trim() || null,
        },
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      setNotice("Account created successfully.");
      await loadUsers();
    } catch (createError) {
      setError(createError.message || "Account could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function updateRole(user) {
    const role = roleChanges[user.user_id];
    if (role === user.role) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest(`/api/users/${user.user_id}/role`, {
        method: "PATCH",
        body: { role },
      });
      setUsers((current) =>
        current.map((item) =>
          item.user_id === result.user.user_id ? result.user : item,
        ),
      );
      setRoleChanges((current) => ({
        ...current,
        [result.user.user_id]: result.user.role,
      }));
      setNotice("User role updated. The new role is enforced on the next API request.");
    } catch (updateError) {
      setError(updateError.message || "User role could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="records-page">
      <section className="page-intro">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>User accounts</h1>
          <p>Create teacher and student accounts and manage their roles.</p>
        </div>
        <button
          className="button button-primary page-action"
          type="button"
          onClick={() => {
            setError("");
            setShowForm(true);
          }}
        >
          <Plus size={16} />
          Add account
        </button>
      </section>

      {notice && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={17} />
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="error-panel" role="alert">
          <div>
            <strong>Unable to complete request</strong>
            <span>{error}</span>
          </div>
          <button className="button button-secondary" type="button" onClick={loadUsers}>
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading-panel" role="status">
          <span className="spinner spinner-dark" />
          <span>Loading users...</span>
        </div>
      ) : users.length === 0 ? (
        <div className="surface-card records-empty">
          <div className="empty-icon">
            <Users size={21} />
          </div>
          <h2>No accounts found</h2>
          <p>Use Add account to create a teacher or student account.</p>
        </div>
      ) : (
        <div className="surface-card user-list">
          {users.map((user) => (
            <div className="user-list-row" key={user.user_id}>
              <div className="user-list-details">
                <strong>{user.full_name}</strong>
                <span>{user.email}</span>
              </div>
              <span className="user-current-role">
                {ROLE_LABELS[user.role] || user.role}
              </span>
              {user.role === "admin" ? (
                <span className="user-protected-role">Backend-provisioned</span>
              ) : (
                <div className="user-role-editor">
                  <select
                    aria-label={`Role for ${user.full_name}`}
                    value={roleChanges[user.user_id] || user.role}
                    disabled={saving}
                    onChange={(event) =>
                      setRoleChanges((current) => ({
                        ...current,
                        [user.user_id]: event.target.value,
                      }))
                    }
                  >
                    <option value="teacher">Teacher</option>
                    <option value="student">Student</option>
                  </select>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={saving || roleChanges[user.user_id] === user.role}
                    onClick={() => updateRole(user)}
                  >
                    Save role
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setShowForm(false);
          }}
        >
          <section
            className="management-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-title"
          >
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">USER MANAGEMENT</span>
                <h2 id="create-user-title">Create account</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close dialog"
                disabled={saving}
                onClick={() => setShowForm(false)}
              >
                <X size={19} />
              </button>
            </div>
            <form className="management-form" onSubmit={createUser}>
              <label className="form-field">
                <span>Full name</span>
                <input
                  name="full_name"
                  value={form.full_name}
                  onChange={updateForm}
                  required
                  maxLength={150}
                />
              </label>
              <label className="form-field">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={updateForm}
                  required
                  maxLength={255}
                />
              </label>
              <label className="form-field">
                <span>Temporary password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={updateForm}
                  minLength={12}
                  required
                />
              </label>
              <label className="form-field">
                <span>Account type</span>
                <select name="role" value={form.role} onChange={updateForm}>
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
                </select>
              </label>
              <label className="form-field">
                <span>Department</span>
                <select
                  name="department_id"
                  value={form.department_id}
                  onChange={updateForm}
                  required
                  disabled={!departments.length}
                >
                  <option value="" disabled>
                    {departments.length
                      ? "Choose a department"
                      : "No departments available"}
                  </option>
                  {departments.map((department) => (
                    <option key={department.dept_id} value={department.dept_id}>
                      {department.dept_name}
                    </option>
                  ))}
                </select>
              </label>
              {!departments.length && (
                <p className="field-hint" role="status">
                  You need to{" "}
                  <Link to="/departments" onClick={() => setShowForm(false)}>
                    create a department
                  </Link>{" "}
                  before creating this account.
                </p>
              )}
              <label className="form-field">
                <span>Phone (optional)</span>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={updateForm}
                  maxLength={30}
                />
              </label>
              <div className="dialog-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={saving}
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={saving || !departments.length}
                >
                  {saving ? "Creating..." : "Create account"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
