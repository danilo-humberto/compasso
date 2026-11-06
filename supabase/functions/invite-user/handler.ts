export interface InviteDependencies {
  authorize(token: string): Promise<boolean>;
  exists(token: string, email: string): Promise<boolean>;
  invite(email: string): Promise<string>;
  assign(
    token: string,
    userId: string,
    role: "admin" | "reader",
  ): Promise<void>;
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
export async function handleInvite(
  request: Request,
  deps: InviteDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST")
    return reply(405, { error: "Método não permitido." });
  const token = /^Bearer\s+(\S+)$/i.exec(
    request.headers.get("Authorization") ?? "",
  )?.[1];
  if (!token) return reply(401, { error: "Sessão inválida. Entre novamente." });
  try {
    if (!(await deps.authorize(token)))
      return reply(403, { error: "Acesso não autorizado." });
  } catch {
    return reply(401, { error: "Sessão inválida. Entre novamente." });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: "Dados inválidos." });
  }
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body?.role;
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    (role !== "reader" && role !== "admin")
  ) {
    return reply(400, {
      error: "Informe um e-mail válido e um perfil permitido.",
    });
  }
  let userId: string;
  try {
    if (await deps.exists(token, email))
      return reply(409, {
        error: "Esta conta já existe. Altere seu perfil na lista de usuários.",
      });
    userId = await deps.invite(email);
  } catch {
    return reply(502, {
      error:
        "Não foi possível enviar o convite. Confira a lista antes de tentar novamente.",
    });
  }
  try {
    await deps.assign(token, userId, role);
  } catch {
    return reply(503, {
      error:
        "O convite foi enviado, mas a conta está com acesso pendente. Atualize a lista e atribua o perfil desejado.",
    });
  }
  return reply(200, { ok: true });
}
