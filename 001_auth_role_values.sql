BEGIN;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users
SET role = CASE LOWER(role)
    WHEN 'admin' THEN 'Admin'
    WHEN 'teacher' THEN 'Teacher'
    WHEN 'student' THEN 'Student'
    ELSE role
END
WHERE role IN ('admin', 'teacher', 'student');

ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('Admin', 'Teacher', 'Student'));

COMMIT;
