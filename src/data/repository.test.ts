import { beforeEach, expect, it, vi } from "vitest";
import { repository } from "./repository";
import { supabase } from "./client";

vi.mock("./client", () => ({ supabase: { rpc: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

it("reseta a base com a revisão e propaga falhas sem repetir a exclusão", async () => {
  vi.mocked(supabase!.rpc).mockResolvedValue({ error: null } as never);
  await repository.resetBase(7);
  expect(supabase!.rpc).toHaveBeenCalledExactlyOnceWith("reset_base", {
    expected_revision: 7,
  });
  vi.mocked(supabase!.rpc).mockResolvedValue({
    error: { message: "A base mudou" },
  } as never);
  await expect(repository.resetBase(7)).rejects.toThrow("A base mudou");
  expect(supabase!.rpc).toHaveBeenCalledTimes(2);
});

it("envia somente os novos dados para a RPC incremental com revisão", async () => {
  vi.mocked(supabase!.rpc).mockResolvedValue({ error: null } as never);
  await repository.importRecords([], 7);
  expect(supabase!.rpc).toHaveBeenCalledExactlyOnceWith(
    "import_records_incremental",
    { incoming: [], expected_revision: 7 },
  );
});

it("recusa banco desatualizado sem tentar a RPC de substituição", async () => {
  vi.mocked(supabase!.rpc).mockResolvedValue({
    error: { code: "PGRST202", message: "Function missing" },
  } as never);
  await expect(repository.importRecords([], 7)).rejects.toThrow(
    /atualizado para importação incremental/,
  );
  expect(supabase!.rpc).toHaveBeenCalledTimes(1);
});
