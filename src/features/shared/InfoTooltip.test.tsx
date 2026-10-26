import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { InfoTooltip } from "./InfoTooltip";
afterEach(cleanup);
it("explica ao passar o mouse, focar ou tocar e fecha com Escape", async () => {
  const user = userEvent.setup();
  render(
    <InfoTooltip label="Dias com atraso">
      Compara entrada e retorno.
    </InfoTooltip>,
  );
  const button = screen.getByRole("button", { name: "Sobre Dias com atraso" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  await user.hover(button);
  expect(screen.getByRole("tooltip").textContent).toBe(
    "Compara entrada e retorno.",
  );
  await user.unhover(button);
  expect(screen.queryByRole("tooltip")).toBeNull();
  await user.tab();
  expect(screen.getByRole("tooltip")).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).toBeNull();
  await user.click(button);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  await user.tab();
  expect(screen.queryByRole("tooltip")).toBeNull();
});
