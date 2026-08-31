import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req, res) {
  // CORS (open for testing — tighten to your domain before launch)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Fail clearly if the API key isn't configured in Vercel
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured: ANTHROPIC_API_KEY is not set." });
  }

  try {
    // Safely parse body whether it arrives as object or string
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { prompt } = body || {};

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514", // verify current ID in Anthropic docs
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText =
      message.content?.[0]?.type === "text" ? message.content[0].text : "";

    return res.status(200).json({ result: responseText });
  } catch (error) {
    console.error("Anthropic API error:", error);
    return res.status(500).json({ error: error.message || "Unknown error" });
  }
}
