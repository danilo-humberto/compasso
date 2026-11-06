import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page, manager: boolean) {
  let access = { role: manager ? "admin" : "reader", canManageUsers: manager };
  const users = [
    {
      id: "owner",
      email: "owner@example.test",
      role: "admin",
      canManageUsers: true,
    },
  ];
  const mutations: string[] = [];
  const user = {
    id: "user",
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.test",
    app_metadata: { provider: "email" },
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
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    let body: unknown;
    if (url.includes("/auth/v1/token"))
      body = {
        access_token: "synthetic-token",
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user,
      };
    else if (url.includes("/auth/v1/user")) body = user;
    else if (url.endsWith("/rpc/get_my_access")) body = access;
    else if (url.endsWith("/rpc/read_snapshot"))
      body = {
        revision: 0,
        imports: [],
        schedules: [],
        records: [
          {
            employeeId: "001",
            name: "Pessoa sintética",
            contract: "Contrato teste",
            date: "2026-11-06",
            punchedDate: "2026-11-06",
            sourceSchedule: "",
            punches: [null, null, null, null],
          },
        ],
      };
    else if (url.endsWith("/rpc/list_app_users")) {
      expect(access.canManageUsers).toBe(true);
      body = users;
    } else if (url.endsWith("/functions/v1/invite-user")) {
      expect(access.canManageUsers).toBe(true);
      const invite = req.postDataJSON();
      expect(invite).toEqual({ email: "reader@example.test", role: "reader" });
      users.push({ id: "new", ...invite, canManageUsers: false });
      mutations.push("invite");
      body = { ok: true };
    } else if (url.endsWith("/rpc/set_user_role")) {
      expect(access.canManageUsers).toBe(true);
      const update = req.postDataJSON();
      expect(update).toEqual({ target_user: "new", new_role: "admin" });
      users[1].role = "admin";
      mutations.push("role");
      body = null;
    } else throw new Error(`Requisição inesperada: ${url}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers,
      body: JSON.stringify(body),
    });
  });
  await page.goto("/");
  await page.getByLabel("E-mail").fill("test@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  return {
    mutations,
    downgrade: () => {
      access = { role: "reader", canManageUsers: false };
    },
  };
}
test("leitor consulta e filtra sem ações de escrita (API simulada)", async ({
  page,
}) => {
  const { mutations } = await setup(page, false);
  await expect(
    page.getByRole("button", { name: /Importar base|Jornadas|Usuários/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Registros de ponto", exact: true })
    .click();
  await page
    .getByLabel("Contrato / localização", { exact: true })
    .selectOption("Contrato teste");
  await page.getByLabel("Colaborador", { exact: true }).selectOption("001");
  await expect(
    page.getByRole("heading", {
      name: "Registros de ponto",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(page.getByText("Pessoa sintética", { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
test("responsável convida leitor e altera seu perfil (API simulada)", async ({
  page,
}) => {
  const { mutations, downgrade } = await setup(page, true);
  await page.getByRole("button", { name: "Usuários", exact: true }).click();
  await page.getByLabel("E-mail (obrigatório)").fill("reader@example.test");
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText(/Convite enviado/)).toBeVisible();
  await page
    .getByLabel("Perfil de reader@example.test", { exact: true })
    .selectOption("admin");
  await expect(
    page.getByText("Perfil de reader@example.test atualizado."),
  ).toBeVisible();
  expect(mutations).toEqual(["invite", "role"]);
  downgrade();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Usuários", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
});
