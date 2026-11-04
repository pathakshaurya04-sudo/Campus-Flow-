import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

let supabaseClient;

export function getSupabaseClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in server/.env",
    );
    error.name = "ConfigurationError";
    throw error;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }

  return supabaseClient;
}
