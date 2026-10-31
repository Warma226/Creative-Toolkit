// Appelée après la connexion Google : applique la règle d'adresse IP
// et renvoie les infos de la page « Mon compte » (quota, historique, adresse IP masquée).
import { cors, DAILY_LIMIT, guard, json, maskIp, usedToday } from "../_shared/guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const g = await guard(req);
  if (!g.ok) return g.res;

  const [used, history, total] = await Promise.all([
    usedToday(g.admin, g.user.id),
    g.admin.from("download_log").select("video_id, title, category, created_at")
      .eq("user_id", g.user.id).order("created_at", { ascending: false }).limit(50),
    g.admin.from("download_log").select("id", { count: "exact", head: true }).eq("user_id", g.user.id),
  ]);

  return json({
    email: g.user.email,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - used),
    member_since: g.account.created_at,
    ip_masked: maskIp(g.account.ip),
    total: total.count ?? 0,
    history: history.data ?? [],
  });
});
