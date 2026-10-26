import { test, expect } from "@playwright/test";
for (const type of ["invite", "recovery"]) {
  test(`${type}: define senha e entra no painel (API simulada)`, async ({
    page,
  }) => {
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "teste@example.test",
      app_metadata: { provider: "email" },
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    };
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({
          sub: user.id,
          aud: "authenticated",
          role: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url"),
      "synthetic-signature",
    ].join(".");
    let saved = false;
    await page.route("http://127.0.0.1:54321/**", async (route) => {
      const req = route.request();
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
      };
      if (req.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers });
        return;
      }
      if (req.url().includes("/auth/v1/user")) {
        if (req.method() === "PUT") {
          expect(req.postDataJSON().password).toBe("nova-senha-sintetica");
          saved = true;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(user),
          headers,
        });
        return;
      }
      if (req.url().endsWith("/rpc/read_snapshot")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            revision: 0,
            records: [],
            schedules: [],
            imports: [],
          }),
          headers,
        });
        return;
      }
      throw new Error("Requisição inesperada no fluxo de senha");
    });
    await page.goto(
      `/#access_token=${token}&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer&type=${type}`,
    );
    await expect(
      page.getByRole("heading", { name: "Defina sua senha" }),
    ).toBeVisible();
    await page
      .getByLabel("Senha", { exact: true })
      .fill("nova-senha-sintetica");
    await page.getByRole("button", { name: "Salvar senha" }).click();
    await expect(
      page.getByRole("heading", { name: "Visão geral", exact: true }),
    ).toBeVisible();
    expect(saved).toBe(true);
  });
}
