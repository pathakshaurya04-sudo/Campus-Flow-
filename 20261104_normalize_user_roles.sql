BEGIN;

ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE public.users
SET role = LOWER(role);

ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'teacher', 'student'));

COMMIT;
