import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, afterAll, expect, it, vi } from "vitest";
import { readWorkbook } from "../../importing/workbook";
import { decodeSnapshot } from "../../data/decode";
import { Imports } from "./Imports";
import { ToastProvider } from "../shared/toast/Toast";
import type { TimeRecord } from "../../domain/types";
vi.mock("../../importing/workbook", () => ({
  readWorkbook: vi.fn(async () => [
    {
      employeeId: "1",
      name: "Pessoa",
      contract: "A",
      date: "2026-08-03",
      punchedDate: "2026-08-03",
      sourceSchedule: "",
      punches: [null, null, null, null],
    } satisfies TimeRecord,
  ]),
}));
afterEach(cleanup);
const dialogMethods = ["showModal", "close"] as const;
const originals = dialogMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
);
beforeAll(() => {
  for (const name of dialogMethods)
    Object.defineProperty(HTMLDialogElement.prototype, name, {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        if (name === "showModal") this.setAttribute("open", "");
        else this.removeAttribute("open");
      },
    });
});
afterAll(() =>
  dialogMethods.forEach((name, i) => {
    if (originals[i])
      Object.defineProperty(HTMLDialogElement.prototype, name, originals[i]!);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }),
);

function setupReset(resetBase = vi.fn(async () => {})) {
  const reload = vi.fn(async () => {});
  render(
    <Imports
      snapshot={{ revision: 7, records: [], imports: [], schedules: [] }}
      repository={{
        resetBase,
        load: vi.fn(),
        importRecords: vi.fn(),
        saveSchedule: vi.fn(),
        deleteSchedule: vi.fn(),
      }}
      reload={reload}
    />,
    { wrapper: ToastProvider },
  );
  return { resetBase, reload };
}
it("só limpa após confirmação e permite cancelar sem digitar texto", async () => {
  const { resetBase, reload } = setupReset();
  await userEvent.click(
    screen.getByRole("button", { name: "Limpar toda a base" }),
  );
  expect(screen.getByRole("dialog").textContent).toContain(
    "para todos os usuários",
  );
  expect(screen.queryByRole("textbox")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(resetBase).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Limpar toda a base" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar limpeza" }),
  );
  expect(resetBase).toHaveBeenCalledExactlyOnceWith(7);
  expect(reload).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Base limpa");
});
it("bloqueia importação e duplo clique durante a limpeza", async () => {
  let finish!: () => void;
  const { resetBase } = setupReset(
    vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Limpar toda a base" }),
  );
  await userEvent.dblClick(
    screen.getByRole("button", { name: "Confirmar limpeza" }),
  );
  expect(resetBase).toHaveBeenCalledOnce();
  expect(
    (screen.getByLabelText("Planilha de ponto") as HTMLInputElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  const cancel = new Event("cancel", { cancelable: true });
  screen.getByRole("dialog").dispatchEvent(cancel);
  expect(cancel.defaultPrevented).toBe(true);
  finish();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("exibe erro e atualiza a base sem repetir automaticamente a limpeza", async () => {
  const { resetBase, reload } = setupReset(
    vi.fn(async () => {
      throw new Error("A base mudou");
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Limpar toda a base" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar limpeza" }),
  );
  expect(screen.getByRole("alert").textContent).toContain("A base mudou");
  expect(resetBase).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
  expect(screen.queryByText("Base limpa")).toBeNull();
});
it("importa ao selecionar sem confirmação nem resumo e encaminha revisão", async () => {
  const importRecords = vi.fn(async () => {}),
    reload = vi.fn(async () => {});
  render(
    <Imports
      snapshot={{
        records: [
          {
            employeeId: "2",
            name: "Pessoa anterior",
            contract: "A",
            date: "2026-08-03",
            punchedDate: "2026-08-03",
            sourceSchedule: "",
            punches: [null, null, null, null],
          },
        ],
        schedules: [],
        imports: [],
        revision: 7,
      }}
      repository={{
        load: vi.fn(),
        resetBase: vi.fn(),
        deleteSchedule: vi.fn(),
        saveSchedule: vi.fn(),
        importRecords,
      }}
      reload={reload}
    />,
    { wrapper: ToastProvider },
  );
  await userEvent.upload(
    screen.getByLabelText("Planilha de ponto"),
    new File(["synthetic"], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  await waitFor(() =>
    expect(importRecords).toHaveBeenCalledWith(
      [expect.objectContaining({ employeeId: "1" })],
      7,
    ),
  );
  await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Confirmar importação" }),
  ).toBeNull();
  expect(screen.queryByText("Confira antes de importar")).toBeNull();
  expect(screen.queryByText(/adicionados.*atualizados.*excluídos/)).toBeNull();
  expect(screen.getByRole("status").textContent).toContain(
    "Base importada com sucesso.",
  );
});

it.each(["Pessoa Teste", undefined])(
  "mostra nome do autor ou indicação de indisponibilidade, sem UUID",
  (actorName) => {
    const actor = "11111111-1111-4111-8111-111111111111";
    render(
      <Imports
        snapshot={{
          revision: 1,
          records: [],
          schedules: [],
          imports: [
            {
              id: "log",
              createdAt: "2026-10-26T12:00:00Z",
              actor,
              actorName,
              inserted: 1,
              updated: 0,
              removed: 0,
            },
          ],
        }}
        repository={{
          load: vi.fn(),
          importRecords: vi.fn(),
          saveSchedule: vi.fn(),
          resetBase: vi.fn(),
          deleteSchedule: vi.fn(),
        }}
        reload={vi.fn()}
      />,
      { wrapper: ToastProvider },
    );
    expect(screen.getByText(actorName ?? "Usuário indisponível")).toBeTruthy();
    expect(screen.queryByText(actor)).toBeNull();
  },
);

it.each(["Pessoa Teste", undefined])(
  "decodifica histórico com nome e mantém compatibilidade com resposta antiga",
  (actorName) => {
    const result = decodeSnapshot({
      revision: 1,
      records: [],
      schedules: [],
      imports: [
        {
          id: "log",
          createdAt: "2026-10-26T12:00:00Z",
          actor: "uuid",
          actorName,
          inserted: 1,
          updated: 0,
          removed: 0,
        },
      ],
    });
    expect(result.imports[0].actorName).toBe(actorName);
    expect(result.imports[0].actor).toBe("uuid");
  },
);

const uploadFile = new File(["synthetic"], "base.xlsx", {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
function setupImport(importRecords = vi.fn(async () => {})) {
  const reload = vi.fn(async () => {});
  render(
    <Imports
      snapshot={{ records: [], schedules: [], imports: [], revision: 3 }}
      repository={{
        load: vi.fn(),
        saveSchedule: vi.fn(),
        resetBase: vi.fn(),
        deleteSchedule: vi.fn(),
        importRecords,
      }}
      reload={reload}
    />,
    { wrapper: ToastProvider },
  );
  return {
    importRecords,
    reload,
    input: screen.getByLabelText("Planilha de ponto") as HTMLInputElement,
  };
}
it("rejeita arquivo inválido sem gravar e permite selecionar o mesmo arquivo novamente", async () => {
  vi.mocked(readWorkbook).mockRejectedValueOnce(new Error("Arquivo inválido"));
  const { input, importRecords } = setupImport();
  await userEvent.upload(input, uploadFile);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Arquivo inválido",
  );
  expect(screen.queryByText("Base importada com sucesso.")).toBeNull();
  expect(importRecords).not.toHaveBeenCalled();
  await userEvent.upload(input, uploadFile);
  await waitFor(() => expect(importRecords).toHaveBeenCalledOnce());
  expect(screen.queryByRole("alert")).toBeNull();
});
it("mostra falha de gravação e recarrega a revisão sem resumo de sucesso", async () => {
  const { input, reload } = setupImport(
    vi.fn(async () => {
      throw new Error("A base mudou");
    }),
  );
  await userEvent.upload(input, uploadFile);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Não foi possível importar a base. A base mudou",
  );
  await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(input.disabled).toBe(false);
  expect(screen.queryByRole("status")).toBeNull();
});
it("bloqueia nova seleção durante a gravação e permite repetir após concluir", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const { input, importRecords } = setupImport(vi.fn(() => pending));
  await userEvent.upload(input, uploadFile);
  await waitFor(() => expect(importRecords).toHaveBeenCalledOnce());
  expect(input.disabled).toBe(true);
  expect(screen.queryByText("Base importada com sucesso.")).toBeNull();
  await userEvent.upload(input, uploadFile);
  expect(importRecords).toHaveBeenCalledOnce();
  finish();
  await waitFor(() => expect(input.disabled).toBe(false));
  await userEvent.upload(input, uploadFile);
  await waitFor(() => expect(importRecords).toHaveBeenCalledTimes(2));
});
