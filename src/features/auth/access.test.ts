import { expect, it, vi } from "vitest";
import { decodeAccess, loadAccess } from "./access";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../../data/client", () => ({ supabase: { rpc } }));
it.each([
  null,
  {},
  { role: "owner", canManageUsers: true },
  { role: "reader", canManageUsers: true },
  { role: "admin" },
])("nega acesso inválido %j", (value) => {
  expect(() => decodeAccess(value)).toThrow(/Acesso não autorizado/);
});
it("não concede admin quando o banco está indisponível ou ainda sem migration", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  await expect(loadAccess()).rejects.toThrow(/verificar suas permissões/);
});
