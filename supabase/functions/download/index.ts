// Appelée avant chaque téléchargement : vérifie le compte et l'adresse IP,
// consomme 1 téléchargement puis l'ajoute à l'historique.
import { cors, DAILY_LIMIT, guard, json } from "../_shared/guard.ts";

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const g = await guard(req);
  if (!g.ok) return g.res;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* corps vide */ }
  const videoId = clean(body.video_id, 100);
  if (!videoId) return json({ error: "Vidéo inconnue." }, 400);

  const { data, error } = await g.admin.rpc("consume_download", { p_user: g.user.id, p_limit: DAILY_LIMIT });
  if (error) return json({ error: "Erreur serveur. Réessaie." }, 500);
  if (data === -1) {
    return json({ error: `Limite de ${DAILY_LIMIT} téléchargements atteinte pour aujourd'hui.`, remaining: 0 }, 429);
  }

  const entry = { user_id: g.user.id, video_id: videoId, title: clean(body.title, 200), category: clean(body.category, 100) };
  const { data: logged } = await g.admin.from("download_log").insert(entry).select("video_id, title, category, created_at").single();

  return json({ remaining: data, entry: logged });
});
