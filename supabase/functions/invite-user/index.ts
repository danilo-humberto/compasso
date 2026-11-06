import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleInvite } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const redirectTo = Deno.env.get("APP_URL")!;
if (!url || !anonKey || !serviceKey || !redirectTo)
  throw new Error("Configure Supabase e APP_URL no servidor.");
const authOptions = { persistSession: false, autoRefreshToken: false };
const admin = createClient(url, serviceKey, { auth: authOptions });
const caller = (token: string) =>
  createClient(url, anonKey, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
Deno.serve((request: Request) =>
  handleInvite(request, {
    async authorize(token) {
      const client = caller(token);
      const {
        data: { user },
        error,
      } = await client.auth.getUser(token);
      if (error || !user) return false;
      const { data, error: accessError } = await client.rpc("get_my_access");
      return (
        !accessError && data?.role === "admin" && data?.canManageUsers === true
      );
    },
    async exists(token, email) {
      const { data, error } = await caller(token).rpc("list_app_users");
      if (error) throw error;
      return data.some(
        (user: { email: string }) => user.email.toLowerCase() === email,
      );
    },
    async invite(email) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });
      if (error || !data.user) throw new Error("Convite indisponível");
      return data.user.id;
    },
    async assign(token, userId, role) {
      const { error } = await caller(token).rpc("set_user_role", {
        target_user: userId,
        new_role: role,
        only_if_missing: true,
      });
      if (error) throw error;
    },
  }),
);
