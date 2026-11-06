export interface DeleteDependencies {
  authorize(token: string): Promise<string | null>;
  revoke(token: string, userId: string): Promise<void>;
  remove(userId: string): Promise<void>;
}
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export async function handleDelete(
  request: Request,
  deps: DeleteDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST")
    return reply(405, { error: "Método não permitido." });
  const token = /^Bearer\s+(\S+)$/i.exec(
    request.headers.get("Authorization") ?? "",
  )?.[1];
  if (!token) return reply(401, { error: "Sessão inválida. Entre novamente." });
  let manager: string | null;
  try {
    manager = await deps.authorize(token);
  } catch {
    return reply(401, { error: "Sessão inválida. Entre novamente." });
  }
  if (!manager) return reply(403, { error: "Acesso não autorizado." });
  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  if (
    typeof userId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      userId,
    )
  )
    return reply(400, { error: "Usuário inválido." });
  if (userId.toLowerCase() === manager.toLowerCase())
    return reply(403, { error: "A conta responsável não pode ser excluída." });
  try {
    // Revalida o gestor e protege qualquer conta responsável dentro do banco.
    // Remove o perfil antes de apagar Auth, bloqueando também JWTs já emitidos.
    await deps.revoke(token, userId);
  } catch {
    return reply(403, {
      error:
        "Não foi possível autorizar a exclusão. Atualize a lista e confira suas permissões.",
    });
  }
  try {
    await deps.remove(userId);
  } catch {
    return reply(503, {
      error:
        "O acesso foi revogado, mas não foi possível excluir a conta. Tente novamente para concluir a exclusão.",
    });
  }
  return reply(200, { ok: true });
}
