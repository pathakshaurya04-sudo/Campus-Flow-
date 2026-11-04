import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  BookOpen,
  Building2,
  Plus,
  Pencil,
  MapPin,
  RefreshCw,
  Users,
} from "lucide-react";
import { useAuth } from "../auth/useAuth.js";
import { apiRequest } from "../api/client.js";
import { ManagementDialog } from "../components/ManagementDialog.jsx";

export function RecordsPage({ type }) {
  const { user } = useAuth();
  const isDepartments = type === "departments";
  const [records, setRecords] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [teacherOptions, setTeacherOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);

  const fetchRecords = useCallback(async () => {
    if (isDepartments) {
      const result = await apiRequest("/api/departments");
      const departments = result.departments || [];
      return { records: departments, departments, teachers: [] };
    }

    const requests = [
      apiRequest("/api/courses"),
      apiRequest("/api/departments"),
      ["admin", "teacher"].includes(user?.role)
        ? apiRequest("/api/users/teachers")
        : Promise.resolve({ teachers: [] }),
    ];
    const [courseResult, departmentResult, teacherResult] =
      await Promise.all(requests);
    return {
      records: courseResult.courses || [],
      departments: departmentResult.departments || [],
      teachers: teacherResult.teachers || [],
    };
  }, [isDepartments, user?.role]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchRecords();
      setRecords(result.records);
      setDepartmentOptions(result.departments);
      setTeacherOptions(result.teachers);
    } catch (loadError) {
      setError(loadError.message || "Records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [fetchRecords]);

  useEffect(() => {
    let active = true;
    fetchRecords()
      .then((result) => {
        if (active) {
          setRecords(result.records);
          setDepartmentOptions(result.departments);
          setTeacherOptions(result.teachers);
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Records could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchRecords]);

  const title = isDepartments ? "Department directory" : "Course catalog";
  const description = isDepartments
    ? "Browse departments and their academic community."
    : "Explore courses offered across the university.";

  return (
    <div className="records-page">
      <section className="page-intro">
        <div>
          <span className="eyebrow">
            {isDepartments ? "ACADEMIC STRUCTURE" : "LEARNING"}
          </span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="record-count">
          <span>{loading ? "—" : records.length}</span>
          <small>{isDepartments ? "departments" : "courses"}</small>
        </div>
        {((isDepartments && user?.role === "admin") ||
          (!isDepartments &&
            ["admin", "teacher"].includes(user?.role))) && (
          <button
            className="button button-primary page-action"
            type="button"
            onClick={() =>
              setDialog({ type: isDepartments ? "department" : "course" })
            }
          >
            <Plus size={16} />
            {isDepartments ? "Add department" : "Create course"}
          </button>
        )}
      </section>

      {notice && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={17} />
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}
      {loading ? (
        <div className="loading-panel" role="status">
          <span className="spinner spinner-dark" />
          <span>Loading {isDepartments ? "departments" : "courses"}...</span>
        </div>
      ) : error ? (
        <div className="error-panel" role="alert">
          <div>
            <strong>Unable to load records</strong>
            <span>{error}</span>
          </div>
          <button className="button button-secondary" onClick={loadRecords}>
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      ) : records.length === 0 ? (
        <div className="surface-card records-empty">
          <div className="empty-icon">
            {isDepartments ? <Building2 size={21} /> : <BookOpen size={21} />}
          </div>
          <h2>No {isDepartments ? "departments" : "courses"} yet</h2>
          <p>
            {isDepartments
              ? user?.role === "admin"
                ? "Add your first department to get started. Departments are required before you can create teacher or student accounts."
                : "No departments have been added yet. Please contact your administrator."
              : "Nothing is available in this catalog yet. Check back after your administrator updates the system."}
          </p>
          {isDepartments && user?.role === "admin" && (
            <button
              className="button button-primary"
              type="button"
              onClick={() => setDialog({ type: "department" })}
            >
              <Plus size={16} />
              Add first department
            </button>
          )}
        </div>
      ) : isDepartments ? (
        <div className="department-cards">
          {records.map((department) => (
            <article className="surface-card directory-card" key={department.dept_id}>
              <div className="directory-card-top">
                <div className="department-symbol department-symbol-large">
                  {department.dept_code?.slice(0, 2) || "DP"}
                </div>
                <span className="directory-code">{department.dept_code}</span>
              </div>
              <h2>{department.dept_name}</h2>
              <div className="directory-location">
                <MapPin size={15} />
                {department.location}
              </div>
              <div className="directory-stats">
                <span>
                  <Users size={15} /> {department.total_staff} staff
                </span>
                <span>{department.total_students} students</span>
              </div>
              <div className="directory-course-count">
                <BookOpen size={15} /> {department.total_courses} courses
              </div>
              {user?.role === "admin" && (
                <div className="directory-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() =>
                      setDialog({ type: "department", initialValue: department })
                    }
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <span>Delete is unavailable</span>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="surface-card records-table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Department</th>
                  <th>Instructor</th>
                  <th>Semester</th>
                  <th>Credits</th>
                  <th>Enrolled</th>
                  <th>Capacity</th>
                </tr>
              </thead>
              <tbody>
                {records.map((course) => (
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
                    <td>{course.instructor?.full_name || "—"}</td>
                    <td>{course.semester}</td>
                    <td>{course.credits}</td>
                    <td>{course.enrolled_students}</td>
                    <td>{course.max_capacity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!isDepartments && ["admin", "teacher"].includes(user?.role) && (
        <p className="api-capability-note">
          Course creation is available. The backend does not currently provide
          course edit or delete endpoints.
        </p>
      )}
      {isDepartments && user?.role === "admin" && (
        <p className="api-capability-note">
          Department deletion is unavailable because the backend has no delete
          endpoint.
        </p>
      )}

      {dialog && (
        <ManagementDialog
          type={dialog.type}
          initialValue={dialog.initialValue}
          departments={departmentOptions}
          teachers={teacherOptions}
          currentUser={user}
          onClose={() => setDialog(null)}
          onSaved={(message) => {
            setDialog(null);
            setNotice(message);
            loadRecords();
          }}
        />
      )}
    </div>
  );
}
