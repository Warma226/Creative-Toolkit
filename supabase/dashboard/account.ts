// Version tout-en-un à coller dans Supabase : Edge Functions > Deploy a new function > Via Editor.
// Nom de la fonction : account

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

// Appelée après la connexion Google : applique la règle d'adresse IP
// et renvoie les infos de la page « Mon compte » (quota, historique, adresse IP masquée).

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
