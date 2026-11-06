// @vitest-environment node
import { expect, it, vi } from "vitest";
import { handleDelete } from "../../../supabase/functions/delete-user/handler";
const target = "22222222-2222-4222-8222-222222222222";
const manager = "11111111-1111-4111-8111-111111111111";
const deps = () => ({
  authorize: vi.fn().mockResolvedValue(manager),
  revoke: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
});
const request = (userId = target, token = "Bearer synthetic") =>
  new Request("https://example.test/delete", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
it("nega sessão ausente, não gestor e exclusão da própria conta", async () => {
  for (const mode of ["missing", "reader", "self"]) {
    const d = deps();
    if (mode === "reader") d.authorize.mockResolvedValue(null);
    const result = await handleDelete(
      request(
        mode === "self" ? manager : target,
        mode === "missing" ? "" : "Bearer synthetic",
      ),
      d,
    );
    expect(result.status).toBe(mode === "missing" ? 401 : 403);
    expect(d.revoke).not.toHaveBeenCalled();
    expect(d.remove).not.toHaveBeenCalled();
  }
});
it("valida UUID e bloqueia exclusão se a proteção no banco recusar", async () => {
  const d = deps();
  expect((await handleDelete(request("invalid"), d)).status).toBe(400);
  d.revoke.mockRejectedValue(new Error("protected"));
  expect((await handleDelete(request(), d)).status).toBe(403);
  expect(d.remove).not.toHaveBeenCalled();
});
it("retira permissão antes de excluir conta permanentemente", async () => {
  const d = deps();
  expect((await handleDelete(request(), d)).status).toBe(200);
  expect(d.revoke).toHaveBeenCalledWith("synthetic", target);
  expect(d.remove).toHaveBeenCalledWith(target);
  expect(d.revoke.mock.invocationCallOrder[0]).toBeLessThan(
    d.remove.mock.invocationCallOrder[0],
  );
});
it("informa falha parcial sem expor detalhes e permite nova tentativa", async () => {
  const d = deps();
  d.remove.mockRejectedValueOnce(new Error("secret"));
  const result = await handleDelete(request(), d);
  expect(result.status).toBe(503);
  expect(await result.text()).toContain("acesso foi revogado");
  expect((await handleDelete(request(), d)).status).toBe(200);
});
