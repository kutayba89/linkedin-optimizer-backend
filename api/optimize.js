// LinkedIn Optimizer API — powered by Google Gemini (free tier).
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const MODEL = "gemini-3.6-flash"; // fast + free-tier friendly

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

    const { mode, text, context } = body || {};

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
      systemInstruction: selected.system,
      generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
    });

    const result = await model.generateContent(userContent);
    const responseText = result.response.text();

    return res.status(200).json({ mode, label: selected.label, result: responseText });
  } catch (error) {
    console.error("Gemini API error:", error);
    return res.status(500).json({ error: error.message || "Unknown error" });
  }
}