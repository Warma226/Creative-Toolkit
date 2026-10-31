// Appelée avant chaque téléchargement : vérifie le compte et l'adresse IP, puis consomme 1 téléchargement.
import { cors, DAILY_LIMIT, guard, json } from "../_shared/guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const g = await guard(req);
  if (!g.ok) return g.res;

  const { data, error } = await g.admin.rpc("consume_download", { p_user: g.user.id, p_limit: DAILY_LIMIT });
  if (error) return json({ error: "Erreur serveur. Réessaie." }, 500);
  if (data === -1) {
    return json({ error: `Limite de ${DAILY_LIMIT} téléchargements atteinte pour aujourd'hui.`, remaining: 0 }, 429);
  }
  return json({ remaining: data });
});
