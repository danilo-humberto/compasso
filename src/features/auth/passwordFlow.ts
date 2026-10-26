export function requiresPassword(hash: string): boolean {
  const type = new URLSearchParams(hash.replace(/^#/, "")).get("type");
  return type === "invite" || type === "recovery";
}
