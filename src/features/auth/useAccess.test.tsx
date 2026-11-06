import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAccess } from "./useAccess";
import { loadAccess, type Access } from "./access";
vi.mock("./access", () => ({ loadAccess: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("resposta antiga não restaura privilégios após rebaixamento", async () => {
  let resolveOld!: (access: Access) => void;
  vi.mocked(loadAccess).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  vi.mocked(loadAccess).mockResolvedValue({
    role: "reader",
    canManageUsers: false,
  });
  const { result } = renderHook(useAccess);
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(result.current.access?.role).toBe("reader"));
  await act(async () => resolveOld({ role: "admin", canManageUsers: false }));
  expect(result.current.access?.role).toBe("reader");
});
it("falha de revalidação remove o acesso anterior", async () => {
  vi.mocked(loadAccess).mockResolvedValueOnce({
    role: "admin",
    canManageUsers: false,
  });
  const { result } = renderHook(useAccess);
  await waitFor(() => expect(result.current.access?.role).toBe("admin"));
  vi.mocked(loadAccess).mockRejectedValueOnce(new Error("Indisponível"));
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(result.current.access).toBeNull());
  expect(result.current.error).toBe("Indisponível");
});
