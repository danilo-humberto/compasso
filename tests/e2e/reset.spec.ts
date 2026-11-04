import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import type { Snapshot } from "../../src/domain/types";

test("reset cancela, limpa filtros e permite importar uma base diferente", async ({
  page,
}) => {
  const snapshot: Snapshot = {
    revision: 4,
    imports: [],
    schedules: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        label: "Jornada preservada",
        target: "contract",
        targetId: "Antigo",
        week: [[], [], [], [], [], [], []],
      },
    ],
    records: [
      {
        employeeId: "old",
        name: "Pessoa anterior",
        contract: "Antigo",
        date: "2026-08-03",
        punchedDate: "2026-08-03",
        sourceSchedule: "",
        punches: [null, null, null, null],
      },
    ],
  };
  let resets = 0;
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "teste@example.test",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      url = req.url();
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
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
    else if (url.endsWith("/rpc/reset_base")) {
      expect(req.postDataJSON().expected_revision).toBe(4);
      resets++;
      snapshot.records = [];
      snapshot.imports = [];
      snapshot.revision++;
    } else if (url.endsWith("/rpc/import_records_incremental")) {
      expect(req.postDataJSON().expected_revision).toBe(5);
      snapshot.records = req.postDataJSON().incoming;
      snapshot.revision++;
    } else throw new Error(`Requisição inesperada: ${url}`);
    await route.fulfill({
      status: 200,
      headers,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("teste@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await page.getByLabel("Mês de referência").selectOption("2026-08");
  await page.getByLabel("Contrato / localização").selectOption("Antigo");
  await page.getByLabel("Colaborador", { exact: true }).selectOption("old");
  await page
    .getByRole("button", { name: "Importar base", exact: true })
    .click();
  const trigger = page.getByRole("button", {
    name: "Limpar toda a base",
    exact: true,
  });
  await trigger.click();
  const modal = page.getByRole("dialog", { name: "Limpar toda a base?" });
  await expect(
    modal.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(resets).toBe(0);
  await trigger.click();
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(resets).toBe(0);
  await trigger.click();
  await page.screenshot({
    path: `test-results/reset-confirm-${test.info().project.name}.png`,
  });
  await modal.getByRole("button", { name: "Confirmar limpeza" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Base limpa" }),
  ).toBeVisible();
  expect(resets).toBe(1);
  expect(snapshot.records).toHaveLength(0);
  await page.getByRole("button", { name: "Jornadas", exact: true }).click();
  await expect(
    page.getByText("Jornada preservada", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Importar base", exact: true })
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
      ],
      [
        "002",
        "Pessoa nova",
        "Novo",
        "03/10/2026",
        "03/10/2026",
        "03/10/2026 08:00",
        "03/10/2026 12:00",
        "03/10/2026 13:00",
        "03/10/2026 17:00",
      ],
    ]),
    "Ponto",
  );
  await page.getByLabel("Planilha de ponto").setInputFiles({
    name: "nova.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer,
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Importação concluída" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Registros de ponto", exact: true })
    .click();
  for (const label of [
    "Mês de referência",
    "Contrato / localização",
    "Colaborador",
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveValue("");
  await expect(page.getByRole("table").getByText("Pessoa nova")).toBeVisible();
  await expect(
    page.getByRole("table").getByText("Pessoa anterior"),
  ).toHaveCount(0);
});
