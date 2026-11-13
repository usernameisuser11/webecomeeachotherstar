import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure the D1 binding in wrangler.cloudflare.jsonc for direct Cloudflare deployment, or the `d1` field in .openai/hosting.json when using Sites."
    );
  }

  return drizzle(env.DB, { schema });
}
