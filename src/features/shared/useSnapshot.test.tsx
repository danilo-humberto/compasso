import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSnapshot } from "./useSnapshot";
afterEach(cleanup);
it("expõe carregamento e erro sem inventar base vazia", async () => {
  const repository = {
    load: vi.fn(async () => {
      throw new Error("Falha de rede");
    }),
    saveSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    importRecords: vi.fn(),
  };
  const { result } = renderHook(() => useSnapshot(repository));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe("Falha de rede");
  expect(result.current.snapshot).toBe(null);
});
