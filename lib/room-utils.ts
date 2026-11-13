export const noCache = { "Cache-Control": "no-store" };
export const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: noCache });
export const MAIN_SKY_CAPACITY = 500;
export const ROOM_SKY_CAPACITY = 300;
export const MAX_REPORTS_PER_DAY = 6;
export const REPORT_REASONS = ["abuse", "spam", "privacy", "other"] as const;

export function publicName(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/[<>\r\n\t\u0000-\u001f]/g, "");
  if (!name || [...name].length > maxLength) return null;
  // A deliberately narrow filter: additional harassment is handled by reports.
  const compact = name.toLowerCase().replace(/[\s.,!?~_()[\]{}"'·-]+/g, "");
  if (/(시발|씨발|씨팔|병신|개새끼|좆|ㅅㅂ|ㅂㅅ|fuck|nigger)/i.test(compact)) return null;
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(name) || /(?:\d[\s-]*){9,11}/.test(name)) return null;
  return name;
}

export function validReportReason(value: unknown): value is typeof REPORT_REASONS[number] {
  return typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value);
}

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
