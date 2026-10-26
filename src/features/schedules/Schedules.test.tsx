import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, afterAll, expect, it, vi } from "vitest";
import { ToastProvider } from "../shared/toast/Toast";
import { Schedules } from "./Schedules";
import type { Snapshot } from "../../domain/types";
const snapshot: Snapshot = {
  revision: 1,
  imports: [],
  records: [
    {
      employeeId: "001",
      name: "Pessoa teste",
      contract: "Contrato teste",
      date: "2026-08-03",
      punchedDate: "2026-08-03",
      punches: [null, null, null, null],
      sourceSchedule: "",
    },
  ],
  schedules: [
    {
      id: "existing",
      label: "Comercial",
      target: "contract",
      targetId: "Contrato teste",

      week: Array.from({ length: 7 }, () => []),
    },
  ],
};
// jsdom does not implement native dialog methods; browser tests cover focus and Escape.
const dialogMethods = ["showModal", "close"] as const;
const originalMethods = dialogMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
);
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
afterAll(() => {
  dialogMethods.forEach((name, i) => {
    const original = originalMethods[i];
    if (original)
      Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
});
afterEach(cleanup);
it("confirma edição de jornada somente depois de persistir", async () => {
  const saveSchedule = vi.fn(async () => {});
  render(
    <Schedules
      snapshot={snapshot}
      repository={{
        load: vi.fn(),
        deleteSchedule: vi.fn(),
        importRecords: vi.fn(),
        saveSchedule,
      }}
      reload={vi.fn(async () => {})}
    />,
    { wrapper: ToastProvider },
  );
  await userEvent.click(screen.getByRole("button", { name: /^Comercial/ }));
  await userEvent.click(screen.getByRole("button", { name: "Salvar jornada" }));
  expect(saveSchedule).toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain(
    "Jornada atualizada",
  );
});
it("não mostra sucesso quando a gravação falha", async () => {
  render(
    <Schedules
      snapshot={snapshot}
      repository={{
        load: vi.fn(),
        deleteSchedule: vi.fn(),
        importRecords: vi.fn(),
        saveSchedule: vi.fn(async () => {
          throw new Error("Falha de rede");
        }),
      }}
      reload={vi.fn(async () => {})}
    />,
    { wrapper: ToastProvider },
  );
  await userEvent.click(screen.getByRole("button", { name: /^Comercial/ }));
  await userEvent.click(screen.getByRole("button", { name: "Salvar jornada" }));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("alert").textContent).toBe("Falha de rede");
});

it("exclui apenas após confirmar e limpa a edição da jornada removida", async () => {
  const deleteSchedule = vi.fn(async () => {});
  const reload = vi.fn(async () => {});
  render(
    <Schedules
      snapshot={snapshot}
      repository={{
        load: vi.fn(),
        importRecords: vi.fn(),
        saveSchedule: vi.fn(),
        deleteSchedule,
      }}
      reload={reload}
    />,
    { wrapper: ToastProvider },
  );
  await userEvent.click(screen.getByRole("button", { name: /^Comercial/ }));
  await userEvent.click(
    screen.getByRole("button", { name: "Excluir jornada Comercial" }),
  );
  expect(deleteSchedule).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Cancelar exclusão" }),
  );
  expect(deleteSchedule).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Excluir jornada Comercial" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar exclusão" }),
  );
  expect(deleteSchedule).toHaveBeenCalledWith("existing", 1);
  expect(reload).toHaveBeenCalledOnce();
  expect(screen.getByRole("status").textContent).toContain("Jornada excluída");
  expect(
    (screen.getByLabelText("Nome da jornada") as HTMLInputElement).value,
  ).toBe("");
});
it("mantém a jornada e não anuncia sucesso quando a exclusão falha", async () => {
  const reload = vi.fn(async () => {});
  render(
    <Schedules
      snapshot={snapshot}
      repository={{
        load: vi.fn(),
        importRecords: vi.fn(),
        saveSchedule: vi.fn(),
        deleteSchedule: vi.fn(async () => {
          throw new Error("A base mudou. Atualize antes de excluir.");
        }),
      }}
      reload={reload}
    />,
    { wrapper: ToastProvider },
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Excluir jornada Comercial" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar exclusão" }),
  );
  expect(screen.getByRole("alert").textContent).toContain("A base mudou");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button", { name: /^Comercial/ })).toBeTruthy();
  expect(reload).toHaveBeenCalledOnce();
});
