// Appelée après la connexion Google : applique la règle d'adresse IP et renvoie le quota restant.
import { cors, DAILY_LIMIT, guard, json, usedToday } from "../_shared/guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const g = await guard(req);
  if (!g.ok) return g.res;

  const used = await usedToday(g.admin, g.user.id);
  return json({ email: g.user.email, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT });
});
