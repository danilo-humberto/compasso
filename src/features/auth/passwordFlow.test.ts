import { expect, it } from "vitest";
import { requiresPassword } from "./passwordFlow";
it("convite e recuperação abrem definição de senha, login normal não", () => {
  expect(requiresPassword("#type=invite&access_token=synthetic")).toBe(true);
  expect(requiresPassword("#type=recovery")).toBe(true);
  expect(requiresPassword("#type=signup")).toBe(false);
  expect(requiresPassword("")).toBe(false);
});
