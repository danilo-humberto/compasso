// @vitest-environment node
import { expect, it, vi } from "vitest";
import { handleInvite } from "../../../supabase/functions/invite-user/handler";
const makeDeps = () => ({
  authorize: vi.fn().mockResolvedValue(true),
  exists: vi.fn().mockResolvedValue(false),
  invite: vi.fn().mockResolvedValue("new-user"),
  assign: vi.fn().mockResolvedValue(undefined),
});
const request = (
  body: unknown = { email: "new@example.test", role: "reader" },
  token = "Bearer synthetic",
) =>
  new Request("https://example.test/invite", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
it("nega token ausente, inválido e usuário sem gestão antes de convidar", async () => {
  for (const token of ["", "Bearer synthetic"]) {
    const deps = makeDeps();
    deps.authorize.mockResolvedValue(false);
    expect((await handleInvite(request(undefined, token), deps)).status).toBe(
      token ? 403 : 401,
    );
    expect(deps.invite).not.toHaveBeenCalled();
    expect(deps.assign).not.toHaveBeenCalled();
  }
});
it("valida perfil e e-mail no servidor", async () => {
  for (const body of [
    { email: "invalid", role: "admin" },
    { email: "a@example.test", role: "owner" },
    null,
  ]) {
    const deps = makeDeps();
    expect((await handleInvite(request(body), deps)).status).toBe(400);
    expect(deps.invite).not.toHaveBeenCalled();
  }
});
it("convida e atribui o perfil escolhido usando o token validado", async () => {
  for (const role of ["reader", "admin"]) {
    const deps = makeDeps();
    expect(
      (await handleInvite(request({ email: " New@example.test ", role }), deps))
        .status,
    ).toBe(200);
    expect(deps.invite).toHaveBeenCalledWith("new@example.test");
    expect(deps.assign).toHaveBeenCalledWith("synthetic", "new-user", role);
  }
});
it("não convida novamente uma conta existente", async () => {
  const deps = makeDeps();
  deps.exists.mockResolvedValue(true);
  expect((await handleInvite(request(), deps)).status).toBe(409);
  expect(deps.invite).not.toHaveBeenCalled();
});
it("informa acesso pendente se o convite foi enviado e a atribuição falhou", async () => {
  const deps = makeDeps();
  deps.assign.mockRejectedValue(new Error("internal secret"));
  const result = await handleInvite(request(), deps);
  expect(result.status).toBe(503);
  expect(await result.text()).toContain("acesso pendente");
});
it("falha no provedor não atribui perfil nem expõe detalhes internos", async () => {
  const deps = makeDeps();
  deps.invite.mockRejectedValue(new Error("internal secret"));
  const result = await handleInvite(request(), deps);
  expect(result.status).toBe(502);
  expect(await result.text()).not.toContain("internal secret");
  expect(deps.assign).not.toHaveBeenCalled();
});
