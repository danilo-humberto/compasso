import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import type { Snapshot, TimeRecord, Schedule } from "../../src/domain/types";
test("login, importar, configurar jornada e conferir saldo (API simulada)", async ({
  page,
}) => {
  const snapshot: Snapshot = {
    revision: 0,
    records: [],
    schedules: [],
    imports: [],
  };
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "teste@example.test",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      url = req.url();
    if (req.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
        },
      });
      return;
    }
    let body: unknown = null;
    if (url.includes("/auth/v1/token"))
      body = {
        access_token: "synthetic-token",
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user,
      };
    else if (url.includes("/auth/v1/user")) body = user;
    else if (url.endsWith("/rpc/read_snapshot")) body = snapshot;
    else if (url.endsWith("/rpc/import_records")) {
      const payload = req.postDataJSON() as {
        incoming: TimeRecord[];
        expected_revision: number;
      };
      expect(payload.expected_revision).toBe(snapshot.revision);
      expect(payload).not.toHaveProperty("import_mode");
      snapshot.records = payload.incoming;
      snapshot.revision++;
    } else if (url.endsWith("/rpc/delete_schedule")) {
      const payload = req.postDataJSON() as {
        schedule_id: string;
        expected_revision: number;
      };
      expect(payload.expected_revision).toBe(snapshot.revision);
      snapshot.schedules = snapshot.schedules.filter(
        (s) => s.id !== payload.schedule_id,
      );
      snapshot.revision++;
    } else if (url.endsWith("/rpc/save_schedule")) {
      const payload = req.postDataJSON() as {
        item: Schedule;
        expected_revision: number;
      };
      expect(payload.expected_revision).toBe(snapshot.revision);
      snapshot.schedules.push(payload.item);
      snapshot.revision++;
    } else throw new Error(`Requisição não prevista: ${url}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("teste@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Importar base/ })
    .first()
    .click();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        "Matrícula",
        "Nome",
        "Localização",
        "Data Lógica",
        "Data da Batida",
        "Data e Hora da Batida 1",
        "Data e Hora da Batida 2",
        "Data e Hora da Batida 3",
        "Data e Hora da Batida 4",
        "Escala/Jornala",
      ],
      [
        "001",
        "Pessoa sintética",
        "Contrato teste",
        "03/08/2026",
        "03/08/2026",
        "03/08/2026 08:00",
        "03/08/2026 12:00",
        "03/08/2026 13:00",
        "03/08/2026 17:00",
        "Comercial",
      ],
    ]),
    "Batidas",
  );
  await page.getByLabel("Planilha de ponto").setInputFiles({
    name: "sintetica.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer,
  });
  await expect.poll(() => snapshot.revision).toBe(1);
  await expect(page.getByLabel("Planilha de ponto")).toBeEnabled();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Confirmar importação" }),
  ).toHaveCount(0);
  await expect(page.getByText("Confira antes de importar")).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Importação concluída" }),
  ).toContainText("Base importada com sucesso.");
  await page.getByRole("button", { name: "Jornadas", exact: true }).click();
  await page.getByLabel("Nome da jornada").fill("Comercial");
  await page
    .getByLabel("Destino", { exact: true })
    .selectOption("Contrato teste");
  await expect(page.getByLabel("Início da vigência")).toHaveCount(0);
  await expect(page.getByLabel("Fim da vigência (opcional)")).toHaveCount(0);
  await page.getByLabel("Períodos de Segunda").selectOption("2");
  await page.getByRole("button", { name: "Salvar jornada" }).click();
  const notification = page
    .getByRole("status")
    .filter({ hasText: "Jornada salva" });
  await expect(notification).toContainText("Jornada adicionada");
  await expect(notification).toHaveCSS("animation-name", "toast-enter");
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Ranking dos colaboradores" }),
  ).toBeVisible();
  await expect(
    page.getByText("Batidas em detalhe", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("08:00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("00:00", { exact: true }).first()).toBeVisible();
  expect(snapshot.records).toHaveLength(1);
  expect(snapshot.schedules).toHaveLength(1);
  await expect(notification).toBeVisible();
  await expect(notification).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: `test-results/dashboard-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Registros de ponto", exact: true })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("Calculado", { exact: true })).toBeVisible();
  await notification
    .getByRole("button", { name: "Fechar notificação: Jornada adicionada" })
    .click();
  await expect(notification).toHaveAttribute("data-state", "leaving");
  await expect(notification).toBeHidden();
  await page.getByRole("button", { name: "Jornadas", exact: true }).click();
  const trash = page.getByRole("button", { name: "Excluir jornada Comercial" });
  await trash.hover();
  await expect(trash).toHaveCSS("background-color", "rgb(254, 226, 226)");
  await page.screenshot({
    path: "test-results/delete-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await trash.click();
  const modal = page.getByRole("dialog", {
    name: "Confirmar exclusão de jornada",
  });
  await expect(modal).toBeVisible();
  const cancel = modal.getByRole("button", { name: "Cancelar exclusão" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    modal.getByRole("button", { name: "Confirmar exclusão" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(trash).toBeFocused();
  expect(snapshot.schedules).toHaveLength(1);
  await trash.click();
  await page.screenshot({
    path: "test-results/modal-" + test.info().project.name + ".png",
  });
  await page.getByRole("button", { name: "Cancelar exclusão" }).click();
  expect(snapshot.schedules).toHaveLength(1);
  await trash.click();
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Jornada excluída" }),
  ).toBeVisible();
  await expect(
    page.getByText("Nenhuma jornada cadastrada.", { exact: false }),
  ).toBeVisible();
  expect(snapshot.schedules).toHaveLength(0);
  expect(snapshot.records).toHaveLength(1);
});
