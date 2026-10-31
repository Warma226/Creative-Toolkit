// Version tout-en-un à coller dans Supabase : Edge Functions > Deploy a new function > Via Editor.
// Nom de la fonction : download

// Vérifications communes : utilisateur connecté + règle « un compte par adresse IP ».
import { createClient, SupabaseClient, User } from "jsr:@supabase/supabase-js@2";

const DAILY_LIMIT = 35;

// true  : le compte ne fonctionne que depuis l'adresse IP où il a été créé.
// false : on empêche seulement de créer deux comptes depuis la même adresse IP.
const STRICT_IP = (Deno.env.get("STRICT_IP") ?? "true") === "true";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Account = { ip: string; created_at: string };
type GuardOk = { ok: true; user: User; admin: SupabaseClient; account: Account };

// Masque l'adresse IP avant de l'afficher : 41.202.•••.••• ou 2a01:cb08:••••
function maskIp(ip: string): string {
  if (ip.includes(".")) { const p = ip.split("."); return `${p[0]}.${p[1]}.•••.•••`; }
  const p = ip.split(":"); return `${p[0]}:${p[1] ?? ""}:••••`;
}
type GuardErr = { ok: false; res: Response };

async function guard(req: Request): Promise<GuardOk | GuardErr> {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false, res: json({ error: "Connecte-toi pour continuer." }, 401) };
  const user = data.user;

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!ip) return { ok: false, res: json({ error: "Adresse IP introuvable." }, 400) };

  let { data: account } = await admin.from("accounts").select("ip, created_at").eq("user_id", user.id).maybeSingle();

  if (!account) {
    // Première connexion : on lie le compte à cette adresse IP, si elle est libre.
    const { data: created, error: insertError } = await admin.from("accounts")
      .insert({ user_id: user.id, email: user.email, ip }).select("ip, created_at").single();
    if (insertError || !created) {
      return { ok: false, res: json({ error: "Un compte existe déjà pour cette adresse IP.", code: "ip_taken" }, 403) };
    }
    account = created;
  } else if (STRICT_IP && account.ip !== ip) {
    return { ok: false, res: json({ error: "Ce compte est lié à une autre adresse IP.", code: "ip_mismatch" }, 403) };
  }

  return { ok: true, user, admin, account: account as Account };
}

async function usedToday(admin: SupabaseClient, userId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await admin.from("downloads").select("count").eq("user_id", userId).eq("day", day).maybeSingle();
  return data?.count ?? 0;
}

// Appelée avant chaque téléchargement : vérifie le compte et l'adresse IP,
// consomme 1 téléchargement puis l'ajoute à l'historique.

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
