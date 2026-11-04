import { useState } from "react";
import { X } from "lucide-react";
import { apiRequest } from "../api/client.js";

const EMPTY_DEPARTMENT = {
  dept_name: "",
  dept_code: "",
  head_of_department: "",
  location: "",
  contact_email: "",
};

const EMPTY_COURSE = {
  course_name: "",
  course_code: "",
  dept_id: "",
  instructor_id: "",
  credits: "3",
  semester: "",
  max_capacity: "30",
};

export function ManagementDialog({
  type,
  initialValue,
  departments = [],
  teachers = [],
  currentUser,
  onClose,
  onSaved,
}) {
  const isDepartment = type === "department";
  const isEditing = Boolean(initialValue);
  const [values, setValues] = useState(() => {
    if (isDepartment) {
      return initialValue
        ? {
            dept_name: initialValue.dept_name || "",
            dept_code: initialValue.dept_code || "",
            head_of_department: initialValue.head_of_department || "",
            location: initialValue.location || "",
            contact_email: initialValue.contact_email || "",
          }
        : { ...EMPTY_DEPARTMENT };
    }

    return {
      ...EMPTY_COURSE,
      dept_id: departments[0]?.dept_id || "",
      instructor_id:
        currentUser?.role === "teacher" ? currentUser.user_id : "",
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateField(event) {
    setValues((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (isDepartment) {
        const body = {
          ...values,
          head_of_department: values.head_of_department || null,
        };
        await apiRequest(
          isEditing
            ? `/api/departments/${initialValue.dept_id}`
            : "/api/departments",
          {
            method: isEditing ? "PUT" : "POST",
            body,
          },
        );
      } else {
        await apiRequest("/api/courses", {
          method: "POST",
          body: {
            ...values,
            credits: Number(values.credits),
            max_capacity: Number(values.max_capacity),
          },
        });
      }

      onSaved(
        `${isDepartment ? "Department" : "Course"} ${isEditing ? "updated" : "created"} successfully.`,
      );
    } catch (saveError) {
      setError(saveError.message || "The changes could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="management-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="management-dialog-title"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">
              {isDepartment ? "DEPARTMENT MANAGEMENT" : "COURSE MANAGEMENT"}
            </span>
            <h2 id="management-dialog-title">
              {isDepartment
                ? `${isEditing ? "Edit" : "Add"} department`
                : "Create course"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close dialog"
            disabled={saving}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <form className="management-form" onSubmit={handleSubmit}>
          {isDepartment ? (
            <>
              <FormField
                label="Department name"
                name="dept_name"
                value={values.dept_name}
                onChange={updateField}
                required
                maxLength={150}
              />
              <FormField
                label="Department code"
                name="dept_code"
                value={values.dept_code}
                onChange={updateField}
                required
                maxLength={20}
              />
              <FormField
                label="Location"
                name="location"
                value={values.location}
                onChange={updateField}
                required
                maxLength={255}
              />
              <FormField
                label="Contact email"
                name="contact_email"
                type="email"
                value={values.contact_email}
                onChange={updateField}
                required
                maxLength={255}
              />
              <FormField
                label="Head of department user ID (optional)"
                name="head_of_department"
                value={values.head_of_department}
                onChange={updateField}
                placeholder="UUID"
              />
            </>
          ) : (
            <>
              <FormField
                label="Course name"
                name="course_name"
                value={values.course_name}
                onChange={updateField}
                required
                maxLength={150}
              />
              <FormField
                label="Course code"
                name="course_code"
                value={values.course_code}
                onChange={updateField}
                required
                maxLength={30}
              />
              <label className="form-field">
                <span>Department</span>
                <select
                  name="dept_id"
                  value={values.dept_id}
                  onChange={updateField}
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
                      {department.dept_name} ({department.dept_code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Teacher</span>
                <select
                  name="instructor_id"
                  value={values.instructor_id}
                  onChange={updateField}
                  required
                  disabled={!teachers.length}
                >
                  <option value="" disabled>
                    {teachers.length
                      ? "Choose a teacher"
                      : "No teachers available"}
                  </option>
                  {teachers.map((teacher) => (
                    <option key={teacher.user_id} value={teacher.user_id}>
                      {teacher.full_name} ({teacher.email})
                    </option>
                  ))}
                </select>
              </label>
              {!teachers.length && (
                <p className="field-hint" role="status">
                  {currentUser?.role === "admin"
                    ? "Create an active teacher account before creating a course."
                    : "No active teacher accounts are available. Contact your administrator."}
                </p>
              )}
              <div className="form-field-row">
                <FormField
                  label="Credits"
                  name="credits"
                  type="number"
                  min="1"
                  max="32767"
                  value={values.credits}
                  onChange={updateField}
                  required
                />
                <FormField
                  label="Max capacity"
                  name="max_capacity"
                  type="number"
                  min="1"
                  step="1"
                  value={values.max_capacity}
                  onChange={updateField}
                  required
                />
              </div>
              <FormField
                label="Semester"
                name="semester"
                value={values.semester}
                onChange={updateField}
                required
                maxLength={30}
                placeholder="e.g. Fall 2026"
              />
            </>
          )}

          {error && (
            <div className="form-error" role="alert">
              <span className="error-mark">!</span>
              {error}
            </div>
          )}

          <div className="dialog-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={
                saving ||
                (!isDepartment &&
                  (departments.length === 0 || teachers.length === 0))
              }
            >
              {saving ? "Saving..." : isEditing ? "Save changes" : "Create"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function FormField({
  label,
  name,
  type = "text",
  value,
  onChange,
  ...inputProps
}) {
  const inputId = `management-${name}`;
  return (
    <label className="form-field" htmlFor={inputId}>
      <span>{label}</span>
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        {...inputProps}
      />
    </label>
  );
}
