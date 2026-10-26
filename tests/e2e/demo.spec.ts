import { test, expect } from "@playwright/test";

test("exige login e não oferece acesso de demonstração", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Entrar na minha conta" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Explorar demonstração" }),
  ).toHaveCount(0);
  await expect(page.getByText("Dados fictícios", { exact: false })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Registros de ponto", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await expect(
    page.getByRole("button", { name: "Enviar instruções" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Explorar demonstração" }),
  ).toHaveCount(0);
});
