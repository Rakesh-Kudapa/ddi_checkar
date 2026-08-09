const STORAGE_KEY = "ddi_client_id";

// Opaque per-browser identifier, generated once and persisted in
// localStorage — NOT authentication, just enough to keep a shared deployed
// link from showing every visitor's checks (including patient context) to
// every other visitor by default. See CLAUDE.md's per-browser isolation
// note: this is spoofable by anyone hitting the API directly, and doesn't
// survive clearing browser data — a deliberate, disclosed tradeoff, not a
// security boundary against an adversarial user.
export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export function clientIdHeader(): Record<string, string> {
  return { "X-Client-Id": getClientId() };
}
