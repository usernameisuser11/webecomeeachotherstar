export const noCache = { "Cache-Control": "no-store" };
export const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: noCache });

export async function hashSecret(value: unknown): Promise<string | null> {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{24,128}$/.test(value)) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}

export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > 3200) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

export function validRoomId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/.test(value);
}
