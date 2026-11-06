import { test, expect, type Page } from "@playwright/test";
async function setup(
  page: Page,
  manager: boolean,
  failRevoke = false,
  pendingUser = false,
) {
  let access = { role: manager ? "admin" : "reader", canManageUsers: manager };
  const users: {
    id: string;
    email: string;
    role: string | null;
    canManageUsers: boolean;
  }[] = [
    {
      id: "owner",
      email: "owner@example.test",
      role: "admin",
      canManageUsers: true,
    },
  ];
  const mutations: string[] = [];
  if (pendingUser)
    users.push({
      id: "new",
      email: "reader@example.test",
      role: null,
      canManageUsers: false,
    });
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
    } else if (url.endsWith("/functions/v1/delete-user")) {
      expect(access.canManageUsers).toBe(true);
      expect(req.postDataJSON()).toEqual({ userId: "new" });
      if (failRevoke) {
        failRevoke = false;
        await route.fulfill({
          status: 403,
          headers,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Exclusão indisponível",
            code: "42501",
          }),
        });
        return;
      }
      users.splice(1, 1);
      mutations.push("revoke");
      body = { ok: true };
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
  await expect(
    page.getByText("Pessoa sintética", { exact: true }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
});
test("revogação exige confirmação, permite cancelar e tratar falha (API simulada)", async ({
  page,
}) => {
  const { mutations } = await setup(page, true, true);
  await page.getByRole("button", { name: "Usuários", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Excluir usuário owner/ }),
  ).toHaveCount(0);
  await page.getByLabel("E-mail (obrigatório)").fill("reader@example.test");
  await page.getByRole("button", { name: "Enviar convite" }).click();
  const revoke = page.getByRole("button", {
    name: "Excluir usuário reader@example.test",
    exact: true,
  });
  await revoke.click();
  const dialog = page.getByRole("dialog", {
    name: "Excluir usuário permanentemente?",
  });
  await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(revoke).toBeFocused();
  expect(mutations).toEqual(["invite"]);
  await revoke.click();
  await dialog.getByRole("button", { name: "Excluir permanentemente" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Exclusão indisponível",
  );
  await expect(revoke).toBeVisible();
  await dialog.getByRole("button", { name: "Excluir permanentemente" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Conta de reader@example.test excluída." }),
  ).toContainText("Conta de reader@example.test excluída.");
  await expect(revoke).toHaveCount(0);
  await expect(
    page.getByLabel("Perfil de reader@example.test", { exact: true }),
  ).toHaveCount(0);
  expect(mutations).toEqual(["invite", "revoke"]);
  await expect(
    page.getByRole("button", { name: "Atualizar lista" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Atualizar lista" }).click();
  await expect(
    page.getByText("reader@example.test", { exact: true }),
  ).toHaveCount(0);
});
test("exclui conta anteriormente revogada (API simulada)", async ({ page }) => {
  await setup(page, true, false, true);
  await page.getByRole("button", { name: "Usuários", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Excluir usuário reader@example.test",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Excluir usuário permanentemente?",
  });
  await expect(dialog).toContainText("não pode ser desfeita");
  await dialog.getByRole("button", { name: "Excluir permanentemente" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Conta de reader@example.test excluída." }),
  ).toContainText("Conta de reader@example.test excluída.");
  await page.getByRole("button", { name: "Atualizar lista" }).click();
  await expect(
    page.getByText("reader@example.test", { exact: true }),
  ).toHaveCount(0);
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
