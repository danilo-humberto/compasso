import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleDelete } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
if (!url || !anonKey || !serviceKey)
  throw new Error("Configure Supabase no servidor.");
const auth = { persistSession: false, autoRefreshToken: false };
const admin = createClient(url, serviceKey, { auth });
const caller = (token: string) =>
  createClient(url, anonKey, {
    auth,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
Deno.serve((request: Request) =>
  handleDelete(request, {
    async authorize(token) {
      const client = caller(token);
      const {
        data: { user },
        error,
      } = await client.auth.getUser(token);
      if (error || !user) return null;
      const { data, error: accessError } = await client.rpc("get_my_access");
      return !accessError &&
        data?.role === "admin" &&
        data?.canManageUsers === true
        ? user.id
        : null;
    },
    async revoke(token, userId) {
      const { error } = await caller(token).rpc("revoke_user_access", {
        target_user: userId,
      });
      if (error) throw error;
    },
    async remove(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      if (error) throw error;
    },
  }),
);
