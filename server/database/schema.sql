CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE departments (
    dept_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dept_name VARCHAR(150) NOT NULL UNIQUE,
    dept_code VARCHAR(20) NOT NULL UNIQUE,
    head_of_department UUID,
    location VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL UNIQUE,
    total_staff INTEGER NOT NULL DEFAULT 0 CHECK (total_staff >= 0),
    total_students INTEGER NOT NULL DEFAULT 0 CHECK (total_students >= 0)
);

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    department_id UUID REFERENCES departments(dept_id) ON DELETE SET NULL,
    phone VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    refresh_token_version INTEGER NOT NULL DEFAULT 0
        CHECK (refresh_token_version >= 0)
);

CREATE FUNCTION update_user_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_user_updated_at();

ALTER TABLE departments
    ADD CONSTRAINT fk_departments_head_of_department
    FOREIGN KEY (head_of_department) REFERENCES users(user_id) ON DELETE SET NULL;

CREATE TABLE courses (
    course_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_name VARCHAR(150) NOT NULL,
    course_code VARCHAR(30) NOT NULL UNIQUE,
    dept_id UUID NOT NULL REFERENCES departments(dept_id) ON DELETE RESTRICT,
    instructor_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    credits SMALLINT NOT NULL CHECK (credits > 0),
    semester VARCHAR(30) NOT NULL,
    max_capacity INTEGER NOT NULL CHECK (max_capacity > 0),
    enrolled_students INTEGER NOT NULL DEFAULT 0
        CHECK (enrolled_students >= 0 AND enrolled_students <= max_capacity)
);

CREATE TABLE enrollments (
    enrollment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    grade VARCHAR(5),
    attendance_percentage NUMERIC(5, 2)
        CHECK (attendance_percentage >= 0 AND attendance_percentage <= 100),
    status VARCHAR(20) NOT NULL DEFAULT 'enrolled'
        CHECK (status IN ('enrolled', 'completed', 'dropped')),
    CONSTRAINT uq_enrollments_student_course UNIQUE (student_id, course_id)
);

CREATE TABLE api_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_endpoint TEXT NOT NULL,
    http_method VARCHAR(10) NOT NULL,
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    request_body JSONB,
    response_body JSONB,
    status_code SMALLINT NOT NULL CHECK (status_code BETWEEN 100 AND 599),
    response_time_ms INTEGER NOT NULL CHECK (response_time_ms >= 0),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_department_id ON users(department_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_courses_dept_id ON courses(dept_id);
CREATE INDEX idx_courses_instructor_id ON courses(instructor_id);
CREATE INDEX idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX idx_enrollments_course_id ON enrollments(course_id);
CREATE INDEX idx_api_logs_user_id ON api_logs(user_id);
CREATE INDEX idx_api_logs_timestamp ON api_logs(timestamp);
