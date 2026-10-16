/** Identifier helpers usable on both server and client (no browser-only APIs). */
export function newPlanId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `plan-${rand}`;
}
