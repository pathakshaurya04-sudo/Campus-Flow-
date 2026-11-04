import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  GraduationCap,
  RefreshCw,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { useAuth } from "../auth/useAuth.js";
import { ManagementDialog } from "../components/ManagementDialog.jsx";

const ROLE_COPY = {
  admin: {
    eyebrow: "ADMINISTRATOR",
    title: "Institution overview",
    description:
      "A snapshot of departments, courses, and the academic community.",
  },
  teacher: {
    eyebrow: "TEACHER WORKSPACE",
    title: "Your teaching overview",
    description: "A quick view of your courses and department directory.",
  },
  student: {
    eyebrow: "STUDENT WORKSPACE",
    title: "Your campus overview",
    description: "Explore courses and get to know your academic community.",
  },
};

function LoadingPanel() {
  return (
    <div className="loading-panel" role="status">
      <span className="spinner spinner-dark" />
      <span>Loading your workspace...</span>
    </div>
  );
}

export function DashboardPage({ role }) {
  const { user } = useAuth();
  const [data, setData] = useState({ departments: [], courses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState(null);
  const copy = ROLE_COPY[role];

  const fetchWorkspaceData = useCallback(async () => {
    const [departmentResult, courseResult] = await Promise.all([
      apiRequest("/api/departments"),
      apiRequest("/api/courses"),
    ]);
    return {
      departments: departmentResult.departments || [],
      courses: courseResult.courses || [],
    };
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchWorkspaceData());
    } catch (loadError) {
      setError(loadError.message || "Workspace data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [fetchWorkspaceData]);

  useEffect(() => {
    let active = true;
    fetchWorkspaceData()
      .then((workspace) => {
        if (active) setData(workspace);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError.message || "Workspace data could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchWorkspaceData]);

  const students = data.departments.reduce(
    (total, department) => total + (department.total_students || 0),
    0,
  );
  const staff = data.departments.reduce(
    (total, department) => total + (department.total_staff || 0),
    0,
  );
  const teacherCourses = data.courses.filter(
    (course) => course.instructor_id === user?.user_id,
  );
  const visibleCourses = role === "teacher" ? teacherCourses : data.courses;

  const cards =
    role === "admin"
      ? [
          {
            label: "Departments",
            value: data.departments.length,
            icon: Building2,
            tone: "violet",
            note: "Across the institution",
          },
          {
            label: "Courses",
            value: data.courses.length,
            icon: BookOpen,
            tone: "blue",
            note: "Available in the catalog",
          },
          {
            label: "Students",
            value: students,
            icon: GraduationCap,
            tone: "green",
            note: `${staff} staff members`,
          },
        ]
      : role === "teacher"
        ? [
            {
              label: "My courses",
              value: teacherCourses.length,
              icon: BookOpen,
              tone: "violet",
              note: "Assigned to your account",
            },
            {
              label: "Departments",
              value: data.departments.length,
              icon: Building2,
              tone: "blue",
              note: "In the directory",
            },
            {
              label: "Course catalog",
              value: data.courses.length,
              icon: GraduationCap,
              tone: "green",
              note: "Across the institution",
            },
          ]
        : [
            {
              label: "Departments",
              value: data.departments.length,
              icon: Building2,
              tone: "violet",
              note: "Explore the directory",
            },
            {
              label: "Courses",
              value: data.courses.length,
              icon: BookOpen,
              tone: "blue",
              note: "In the course catalog",
            },
            {
              label: "Academic community",
              value: staff + students,
              icon: Users,
              tone: "green",
              note: "Staff and students",
            },
          ];

  return (
    <div className="dashboard-page">
      <section className="welcome-row">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>
            {copy.description}
            {user?.full_name ? ` Welcome, ${user.full_name.split(" ")[0]}.` : ""}
          </p>
        </div>
        <div className="welcome-date">
          <span className="date-dot" />
          Academic workspace
        </div>
      </section>

      {loading ? (
        <LoadingPanel />
      ) : error ? (
        <div className="error-panel" role="alert">
          <div>
            <strong>We couldn&apos;t load your workspace</strong>
            <span>{error}</span>
          </div>
          <button className="button button-secondary" onClick={loadWorkspace}>
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      ) : (
        <>
          {notice && (
            <div className="success-banner" role="status">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}
          <section className="stat-grid" aria-label="Workspace statistics">
            {cards.map(({ label, value, icon: Icon, tone, note }) => (
              <article className="stat-card" key={label}>
                <div className={`stat-icon stat-icon-${tone}`}>
                  <Icon size={19} strokeWidth={1.9} />
                </div>
                <div className="stat-label">{label}</div>
                <div className="stat-value">{value.toLocaleString()}</div>
                <div className="stat-note">{note}</div>
              </article>
            ))}
          </section>

          <section className="content-grid">
            <article className="surface-card course-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">COURSE CATALOG</span>
                  <h2>{role === "teacher" ? "Your course workspace" : "Courses"}</h2>
                </div>
                <Link className="text-link" to="/courses">
                  View catalog <ArrowUpRight size={16} />
                </Link>
              </div>
              {visibleCourses.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Department</th>
                        <th>Semester</th>
                        <th>Enrolled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCourses.slice(0, 5)
                        .map((course) => (
                          <tr key={course.course_id}>
                            <td>
                              <div className="table-primary">
                                <span className="course-mini-icon">
                                  <BookOpen size={15} />
                                </span>
                                <span>
                                  <strong>{course.course_name}</strong>
                                  <small>{course.course_code}</small>
                                </span>
                              </div>
                            </td>
                            <td>{course.department?.dept_name || "—"}</td>
                            <td>{course.semester}</td>
                            <td>{course.enrolled_students}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={BookOpen}
                  title="No courses to show yet"
                  message="Courses will appear here when they are available in your department catalog."
                />
              )}
            </article>

            <article className="surface-card department-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">DIRECTORY</span>
                  <h2>Departments</h2>
                </div>
                <Link
                  className="icon-link"
                  to="/departments"
                  aria-label="View all departments"
                >
                  <ArrowUpRight size={17} />
                </Link>
              </div>
              {data.departments.length ? (
                <div className="department-list">
                  {data.departments.slice(0, 5).map((department) => (
                    <div className="department-list-item" key={department.dept_id}>
                      <div className="department-symbol">
                        {department.dept_code?.slice(0, 2) || "DP"}
                      </div>
                      <div className="department-list-copy">
                        <strong>{department.dept_name}</strong>
                        <span>
                          {department.dept_code} · {department.total_courses} courses
                        </span>
                      </div>
                      <span className="department-location">
                        {department.location}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Building2}
                  title="Directory is empty"
                  message="Departments will appear here once they are added."
                />
              )}
            </article>
          </section>

          {role === "admin" && (
            <section className="capability-panel surface-card">
              <div>
                <span className="eyebrow">AVAILABLE ACTIONS</span>
                <h2>Manage academic records</h2>
                <p>
                  Create or update departments and create courses using the
                  operations currently supported by the backend.
                </p>
              </div>
              <div className="capability-actions">
                <Link className="button button-secondary" to="/departments">
                  <Building2 size={16} />
                  Manage departments
                </Link>
                <Link className="button button-secondary" to="/courses">
                  <BookOpen size={16} />
                  Manage courses
                </Link>
              </div>
              <p className="api-capability-note">
                Department delete, course edit/delete, and user management
                endpoints are not implemented.
              </p>
            </section>
          )}

          {role === "teacher" && (
            <section className="capability-panel surface-card">
              <div>
                <span className="eyebrow">TEACHING WORKSPACE</span>
                <h2>Assigned courses</h2>
                <p>
                  {teacherCourses.length
                    ? `${teacherCourses.length} course${teacherCourses.length === 1 ? "" : "s"} are assigned to your account.`
                    : "No courses are currently assigned to your account."}
                </p>
              </div>
              <Link className="button button-secondary" to="/courses">
                <BookOpen size={16} />
                Browse courses
              </Link>
              <p className="api-capability-note">
                Student enrollment and roster endpoints are not available.
                Course creation is supported by the backend.
              </p>
              <button
                className="button button-primary"
                type="button"
                onClick={() => setDialog({ type: "course" })}
              >
                Create a course
              </button>
            </section>
          )}

          {role === "student" && (
            <section className="student-profile-grid">
              <article className="surface-card student-profile-card">
                <span className="eyebrow">YOUR PROFILE</span>
                <h2>{user?.full_name}</h2>
                <p>{user?.email}</p>
                <div className="profile-detail-list">
                  <div>
                    <span>Role</span>
                    <strong>{user?.role}</strong>
                  </div>
                  <div>
                    <span>Department</span>
                    <strong>{user?.department_id || "Not assigned"}</strong>
                  </div>
                </div>
              </article>
              <article className="surface-card enrollment-unavailable">
                <span className="eyebrow">ENROLLMENTS</span>
                <h2>Enrollment data isn&apos;t available yet</h2>
                <p>
                  The database has enrollment records, but the backend does not
                  currently expose an enrollment API. No enrolled courses are
                  assumed or shown here.
                </p>
                <Link className="button button-secondary" to="/courses">
                  Browse course catalog
                </Link>
                <span className="api-capability-note">
                  Course enrollment actions are not currently supported.
                </span>
              </article>
            </section>
          )}
          <div className="dashboard-footnote">
            Information shown is retrieved from your department system.
          </div>
        </>
      )}
      {dialog && (
        <ManagementDialog
          type={dialog.type}
          departments={data.departments}
          currentUser={user}
          onClose={() => setDialog(null)}
          onSaved={(message) => {
            setDialog(null);
            setNotice(message);
            loadWorkspace();
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, message }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={20} />
      </div>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}
