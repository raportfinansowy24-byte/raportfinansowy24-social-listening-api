const PORT = Number(Bun.env.PORT || 3000);
const SUPABASE_URL = (Bun.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = Bun.env.SUPABASE_SERVICE_ROLE_KEY || "";
const AGENT_API_KEY = Bun.env.AGENT_API_KEY || "";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const authorized = (req: Request) => !!AGENT_API_KEY && req.headers.get("x-agent-api-key") === AGENT_API_KEY;

async function sb(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase environment is not configured");
  const headers = new Headers(init.headers);
  headers.set("apikey", SUPABASE_SERVICE_ROLE_KEY);
  headers.set("Authorization", `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`);
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  const body = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

const clamp = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health")
      return json({ ok: true, service: "raportfinansowy24-social-listening-api", time: new Date().toISOString() });

    if (url.pathname.startsWith("/v1/") && !authorized(req)) return json({ error: "Unauthorized" }, 401);

    try {
      if (req.method === "GET" && url.pathname === "/v1/opportunities") {
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
        let path = `social_opportunities?select=*&order=total_score.desc,discovered_at.desc&limit=${limit}`;
        const status = url.searchParams.get("status");
        if (status) path += `&status=eq.${encodeURIComponent(status)}`;
        return json(await sb(path));
      }

      if (req.method === "GET" && url.pathname === "/v1/stats") {
        const rows = await sb("social_opportunities?select=status,link_added,clicks,leads,conversions,total_score");
        return json({
          opportunities: rows.length,
          published: rows.filter((r:any)=>r.status==="published").length,
          links_published: rows.filter((r:any)=>r.link_added).length,
          clicks: rows.reduce((a:any,r:any)=>a+Number(r.clicks||0),0),
          leads: rows.reduce((a:any,r:any)=>a+Number(r.leads||0),0),
          conversions: rows.reduce((a:any,r:any)=>a+Number(r.conversions||0),0),
          high_priority: rows.filter((r:any)=>Number(r.total_score)>=80).length
        });
      }

      if (req.method === "POST" && url.pathname === "/v1/opportunities") {
        const b = await req.json();
        for (const k of ["platform","discussion_url","topic","problem_summary"])
          if (!b[k]) return json({ error: `Missing field: ${k}` }, 400);

        const scores = {
          intent_score: clamp(b.intent_score,0,25),
          fit_score: clamp(b.fit_score,0,25),
          conversion_score: clamp(b.conversion_score,0,20),
          quality_score: clamp(b.quality_score,0,15),
          link_naturalness_score: clamp(b.link_naturalness_score,0,15)
        };
        if (Object.values(scores).some(v => v === null)) return json({ error: "Invalid score range" }, 400);

        const payload = {
          ...b, ...scores,
          total_score: Object.values(scores).reduce((a:any,v:any)=>a+v,0),
          updated_at: new Date().toISOString()
        };
        return json(await sb("social_opportunities?on_conflict=platform%2Cdiscussion_url", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify(payload)
        }), 201);
      }

      if (req.method === "POST" && url.pathname === "/v1/runs") {
        return json(await sb("social_agent_runs", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(await req.json())
        }), 201);
      }

      return json({ error: "Not found" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
    }
  }
});
