// Returns the logged-in user's trial/paid status from the database.
// Used by app.html on page load to show an accurate trial badge.
import { createClient } from "@supabase/supabase-js";

const FREE_TRIES = 3;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseReady = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const supabaseAdmin = supabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!supabaseReady) {
    // Auth not configured — report open access so the tool still works.
    return res.status(200).json({ usesCount: 0, isPaid: false, triesLeft: FREE_TRIES, authDisabled: true });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return res.status(401).json({ error: "Not logged in.", code: "NOT_LOGGED_IN" });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData || !userData.user) {
      return res.status(401).json({ error: "Session expired.", code: "NOT_LOGGED_IN" });
    }
    const userId = userData.user.id;

    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("uses_count, is_paid")
      .eq("id", userId)
      .single();
    if (profErr || !prof) {
      return res.status(500).json({ error: "Could not load account." });
    }

    const triesLeft = prof.is_paid ? null : Math.max(0, FREE_TRIES - prof.uses_count);
    return res.status(200).json({
      email: userData.user.email,
      usesCount: prof.uses_count,
      isPaid: prof.is_paid,
      triesLeft,
    });
  } catch (error) {
    console.error("/api/me error:", error);
    return res.status(500).json({ error: "Server error." });
  }
}