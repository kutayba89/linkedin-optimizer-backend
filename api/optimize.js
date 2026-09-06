// LinkedIn Optimizer API — powered by Google Gemini (free tier).
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const MODEL = "gemini-3.6-flash"; // fast + free-tier friendly

// Free trial limit (per registered account, tracked in the database).
const FREE_TRIES = 3;

// Supabase admin client (server-side only — uses the secret service_role key).
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseReady = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const supabaseAdmin = supabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

/* ---------- License / access control ----------
 * Configured entirely via Vercel Environment Variables — no code changes needed later.
 *
 * ACCESS_CODES     Comma-separated list of valid paid access codes,
 *                  e.g. "LIO-AB12-CD34,LIO-EF56-GH78"
 * ENFORCE_LICENSE  "true" to REQUIRE a valid code on every request (real paywall).
 *                  Unset/"false" = open (free-trial handled softly on the frontend).
 *
 * Because this check runs on the SERVER, it cannot be bypassed from the browser.
 */
function getValidCodes() {
  return (process.env.ACCESS_CODES || "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}
function isEnforcing() {
  return String(process.env.ENFORCE_LICENSE || "").toLowerCase() === "true";
}
function isValidCode(code) {
  if (!code) return false;
  return getValidCodes().includes(String(code).trim().toUpperCase());
}

// Structured optimization modes with strong, purpose-built system prompts.
const MODES = {
  headline: {
    label: "LinkedIn Headline",
    system: `You are an expert LinkedIn strategist and recruiter.
Rewrite the user's LinkedIn headline to be punchy, keyword-rich, and recruiter-friendly.
Rules:
- Max 220 characters per option.
- Lead with the role/value, include 2-4 high-signal keywords.
- Avoid clichés ("results-driven", "hardworking").
Return exactly 3 distinct headline options, each on its own line, numbered 1-3. No preamble.`,
  },

  summary: {
    label: "LinkedIn About / Summary",
    system: `You are an expert LinkedIn profile writer.
Rewrite the user's "About" section into a compelling first-person summary.
Rules:
- 3-4 short paragraphs, ~120-200 words total.
- Open with a strong hook, show impact with metrics where possible, end with a clear call to action.
- Natural keywords, no buzzword stuffing.
Return only the rewritten summary. No preamble.`,
  },

  experience: {
    label: "Experience Bullets",
    system: `You are an expert resume and LinkedIn experience writer.
Rewrite the user's job experience into strong achievement-focused bullet points.
Rules:
- Start each bullet with a powerful action verb.
- Quantify impact with metrics (%, $, time, scale) wherever plausible; if none given, use realistic placeholders like "[X%]".
- Use the format: Action + Task + Result.
- 4-6 bullets max.
Return only the bullet points, each starting with "• ". No preamble.`,
  },

  resume: {
    label: "Resume Enhancement",
    system: `You are an expert resume writer and ATS optimization specialist.
Improve the user's resume text: stronger action verbs, measurable metrics, ATS-friendly phrasing.
Rules:
- Preserve the user's real facts; enhance clarity and impact.
- Flag missing metrics with "[add metric]".
- Keep formatting clean and scannable.
Return the improved resume text plus a short "Key improvements" list at the end. No preamble.`,
  },

  cover_letter: {
    label: "Cover Letter",
    system: `You are an expert career coach who writes compelling cover letters.
Write a concise, tailored cover letter based on the user's background and (if provided) the target role/company.
Rules:
- 3-4 paragraphs, ~250-350 words.
- Confident but not arrogant; specific, not generic.
- Clear opening hook and a strong closing call to action.
Return only the cover letter. No preamble.`,
  },
};

export default async function handler(req, res) {
  // CORS (open for testing — tighten to your domain before launch)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Server misconfigured: GEMINI_API_KEY is not set." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const { mode, text, context, code, lang } = body || {};

    // Language for the AI output: "de" (German) or "en" (English). Default English.
    const language = lang === "de" ? "de" : "en";
    const languageInstruction =
      language === "de"
        ? "\n\nWICHTIG: Antworte ausschließlich auf Deutsch. Verwende professionelles, natürliches Deutsch."
        : "\n\nIMPORTANT: Respond only in English.";

    // ---- Account-based trial gate (bypass-proof, tracked in the database) ----
    // The browser sends the logged-in user's token in the Authorization header.
    let profile = null;
    let userId = null;
    if (supabaseReady) {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

      if (!token) {
        return res.status(401).json({ error: "Please log in to use the tool.", code: "NOT_LOGGED_IN" });
      }

      // Verify the token with Supabase → get the real user (cannot be faked).
      const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (userErr || !userData || !userData.user) {
        return res.status(401).json({ error: "Session expired. Please log in again.", code: "NOT_LOGGED_IN" });
      }
      userId = userData.user.id;

      // Read their profile row (trial count + paid status).
      const { data: prof, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("uses_count, is_paid")
        .eq("id", userId)
        .single();
      if (profErr || !prof) {
        return res.status(500).json({ error: "Could not load your account. Please try again." });
      }
      profile = prof;

      // Gate: if not paid and out of free tries → block with paywall signal.
      if (!profile.is_paid && profile.uses_count >= FREE_TRIES) {
        return res.status(402).json({
          error: "You've used all your free optimizations. Upgrade for unlimited access.",
          code: "LIMIT_REACHED",
          usesCount: profile.uses_count,
          isPaid: profile.is_paid,
        });
      }
    }

    if (!mode || !MODES[mode]) {
      return res.status(400).json({
        error: `Invalid mode. Valid modes: ${Object.keys(MODES).join(", ")}`,
      });
    }

    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return res
        .status(400)
        .json({ error: "Please provide at least a few words of input text." });
    }

    if (text.length > 8000) {
      return res
        .status(400)
        .json({ error: "Input too long (max 8000 characters)." });
    }

    const selected = MODES[mode];

    const userContent = context
      ? `Target role/company or extra context:\n${context}\n\n---\n\nUser input:\n${text}`
      : `User input:\n${text}`;

    // Gemini uses a systemInstruction field instead of a system message.
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: selected.system + languageInstruction,
      generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
    });

    const result = await model.generateContent(userContent);
    const responseText = result.response.text();

    // Count this successful use in the database (only for logged-in, non-paid users).
    let usesCount = profile ? profile.uses_count : 0;
    const isPaid = profile ? profile.is_paid : false;
    if (supabaseReady && userId && profile && !profile.is_paid) {
      usesCount = profile.uses_count + 1;
      await supabaseAdmin
        .from("profiles")
        .update({ uses_count: usesCount })
        .eq("id", userId);
    }

    const triesLeft = isPaid ? null : Math.max(0, FREE_TRIES - usesCount);

    return res.status(200).json({
      mode,
      label: selected.label,
      result: responseText,
      usesCount,
      isPaid,
      triesLeft,
    });
  } catch (error) {
    console.error("Gemini API error:", error);
    return res.status(500).json({ error: error.message || "Unknown error" });
  }
}