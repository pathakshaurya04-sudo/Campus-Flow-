export const USER_PROFILE_COLUMNS =
  "user_id,email,full_name,role,department_id,phone,created_at,updated_at,is_active";

export function toUserProfile(user) {
  return {
    user_id: user.user_id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    department_id: user.department_id,
    phone: user.phone,
    created_at: user.created_at,
    updated_at: user.updated_at,
    is_active: user.is_active,
  };
}
