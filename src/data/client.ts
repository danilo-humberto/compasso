import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { requiresPassword } from "../features/auth/passwordFlow";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Capturar antes de o SDK consumir/remover o fragmento do convite.
export const passwordRequested = requiresPassword(window.location.hash);
export const supabase = url && key ? createClient<Database>(url, key) : null;
