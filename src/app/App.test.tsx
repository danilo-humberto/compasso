import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { ToastProvider } from "../features/shared/toast/Toast";
import { decodeSnapshot } from "../data/decode";

vi.mock("../features/auth/Session", () => ({
  useSession: () => ({
    session: { user: { id: "user", email: "test@example.test" } },
    loading: false,
    recovery: false,
  }),
  signOut: vi.fn(),
}));
vi.mock("../features/shared/useSnapshot", () => ({
  useSnapshot: () => ({
    snapshot: decodeSnapshot({
      revision: 1,
      records: [],
      imports: [],
      schedules: [
        {
          id: "first",
          label: "Antiga",
          target: "contract",
          targetId: "A",
          from: "2026-01-01",
          to: "2026-01-31",
          week: [[], [], [], [], [], [], []],
        },
        {
          id: "second",
          label: "Atual",
          target: "contract",
          targetId: "A",
          from: "2026-02-01",
          to: null,
          week: [[], [], [], [], [], [], []],
        },
      ],
    }),
    error: "",
    loading: false,
    reload: vi.fn(),
  }),
}));
afterEach(cleanup);
it("permite resolver jornadas legadas duplicadas sem exibir cálculos ambíguos", () => {
  render(<App />, { wrapper: ToastProvider });
  expect(screen.getByRole("alert").textContent).toContain(
    "cálculos ficam suspensos",
  );
  expect(
    screen.getByRole("button", { name: "Excluir jornada Antiga" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Excluir jornada Atual" }),
  ).toBeTruthy();
  expect(screen.queryByText("Horas registradas", { exact: true })).toBeNull();
});
