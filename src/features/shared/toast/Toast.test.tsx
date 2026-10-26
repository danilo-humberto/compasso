import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function Actions() {
  const { notify } = useToast();
  return (
    <>
      {(["added", "updated", "deleted"] as const).map((action) => (
        <button
          key={action}
          onClick={() =>
            notify({ action, message: `Operação ${action} concluída.` })
          }
        >
          {action}
        </button>
      ))}
    </>
  );
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("mostra feedback para adicionar, editar e excluir sem roubar o foco", () => {
  render(
    <ToastProvider>
      <Actions />
    </ToastProvider>,
  );
  const button = screen.getByText("added");
  button.focus();
  fireEvent.click(button);
  fireEvent.click(screen.getByText("updated"));
  fireEvent.click(screen.getByText("deleted"));
  expect(screen.getAllByRole("status")).toHaveLength(3);
  expect(screen.getByText("Dados adicionados")).toBeTruthy();
  expect(screen.getByText("Dados atualizados")).toBeTruthy();
  expect(screen.getByText("Dados excluídos")).toBeTruthy();
  expect(document.activeElement).toBe(button);
});
it("mantém o toast durante a animação de saída e remove depois", () => {
  render(
    <ToastProvider>
      <Actions />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("added"));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Fechar notificação: Dados adicionados",
    }),
  );
  expect(screen.getByRole("status").getAttribute("data-state")).toBe("leaving");
  act(() => vi.advanceTimersByTime(250));
  expect(screen.queryByRole("status")).toBeNull();
});
it("fecha automaticamente e pausa enquanto o usuário interage", () => {
  render(
    <ToastProvider>
      <Actions />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText("added"));
  act(() => vi.advanceTimersByTime(2000));
  fireEvent.mouseEnter(screen.getByRole("status"));
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByRole("status").getAttribute("data-state")).toBe("visible");
  fireEvent.mouseLeave(screen.getByRole("status"));
  act(() => vi.advanceTimersByTime(4000));
  expect(screen.getByRole("status").getAttribute("data-state")).toBe("leaving");
  act(() => vi.advanceTimersByTime(250));
  expect(screen.queryByRole("status")).toBeNull();
});
it("enfileira notificações além das três visíveis", () => {
  render(
    <ToastProvider>
      <Actions />
    </ToastProvider>,
  );
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText("added"));
  expect(screen.getAllByRole("status")).toHaveLength(3);
  fireEvent.click(
    screen.getAllByRole("button", {
      name: "Fechar notificação: Dados adicionados",
    })[0],
  );
  act(() => vi.advanceTimersByTime(250));
  expect(screen.getAllByRole("status")).toHaveLength(3);
});
