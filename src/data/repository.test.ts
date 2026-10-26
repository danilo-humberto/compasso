import { beforeEach, expect, it, vi } from "vitest";
import { repository } from "./repository";
import { supabase } from "./client";

vi.mock("./client", () => ({ supabase: { rpc: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

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
