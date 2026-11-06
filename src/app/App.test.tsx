import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { ToastProvider } from "../features/shared/toast/Toast";
import { decodeSnapshot } from "../data/decode";
const accessState = vi.hoisted(() => ({
  access: { role: "admin", canManageUsers: false } as {
    role: string;
    canManageUsers: boolean;
  } | null,
  loading: false,
  error: "",
}));
vi.mock("../features/auth/useAccess", () => ({ useAccess: () => accessState }));
beforeEach(() => {
  accessState.access = { role: "admin", canManageUsers: false };
  accessState.loading = false;
  accessState.error = "";
});

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
it("leitor vê somente consultas, inclusive diante de conflito de jornadas", () => {
  accessState.access = { role: "reader", canManageUsers: false };
  render(<App />, { wrapper: ToastProvider });
  expect(screen.getByRole("button", { name: /Visão geral/ })).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /Registros de ponto/ }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Importar base/ })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Jornadas|Excluir jornada|Usuários/ }),
  ).toBeNull();
  expect(
    screen.getByText(/Solicite a correção a um administrador/),
  ).toBeTruthy();
});
it("não libera a aplicação quando a permissão não está disponível", () => {
  accessState.access = null;
  accessState.error = "Acesso não autorizado";
  render(<App />, { wrapper: ToastProvider });
  expect(screen.getByRole("alert").textContent).toContain(
    "Acesso não autorizado",
  );
  expect(screen.queryByRole("button", { name: /Importar base/ })).toBeNull();
});
it("somente o responsável tem acesso à gestão de usuários", () => {
  accessState.access = { role: "admin", canManageUsers: true };
  render(<App />, { wrapper: ToastProvider });
  expect(screen.getByRole("button", { name: /Usuários/ })).toBeTruthy();
});
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
