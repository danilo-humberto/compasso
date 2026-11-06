import { supabase } from "../../data/client";
export type Access = { role: "admin" | "reader"; canManageUsers: boolean };
export type AppUser = {
  id: string;
  email: string;
  role: Access["role"] | null;
  canManageUsers: boolean;
};
export function decodeAccess(value: unknown): Access {
  if (
    !value ||
    typeof value !== "object" ||
    !("role" in value) ||
    (value.role !== "admin" && value.role !== "reader") ||
    !("canManageUsers" in value) ||
    typeof value.canManageUsers !== "boolean" ||
    (value.canManageUsers && value.role !== "admin")
  ) {
    throw new Error(
      "Acesso não autorizado. Solicite a liberação ao responsável.",
    );
  }
  return { role: value.role, canManageUsers: value.canManageUsers };
}
export async function loadAccess(): Promise<Access> {
  if (!supabase) throw new Error("Configure o Supabase.");
  const { data, error } = await supabase.rpc("get_my_access");
  if (error)
    throw new Error(
      "Não foi possível verificar suas permissões. Tente novamente.",
    );
  return decodeAccess(data);
}
export async function listUsers(): Promise<AppUser[]> {
  if (!supabase) throw new Error("Configure o Supabase.");
  const { data, error } = await supabase.rpc("list_app_users");
  if (error) throw new Error(error.message);
  return data as AppUser[];
}
export async function setUserRole(id: string, role: Access["role"]) {
  if (!supabase) throw new Error("Configure o Supabase.");
  const { error } = await supabase.rpc("set_user_role", {
    target_user: id,
    new_role: role,
  });
  if (error) throw new Error(error.message);
}
export async function inviteUser(email: string, role: Access["role"]) {
  if (!supabase) throw new Error("Configure o Supabase.");
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: { email, role },
  });
  if (error) {
    let message =
      "Não foi possível enviar o convite. Confira a lista antes de tentar novamente.";
    if (error.context instanceof Response) {
      const body = await error.context.json().catch(() => null);
      if (typeof body?.error === "string") message = body.error;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
}
