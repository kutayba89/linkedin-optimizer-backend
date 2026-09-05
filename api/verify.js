// Verifies an access code against the server-side ACCESS_CODES env variable.
// This runs on the server, so it cannot be bypassed from the browser.

function getValidCodes() {
  return (process.env.ACCESS_CODES || "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const code = (body && body.code ? String(body.code) : "").trim().toUpperCase();

    if (!code) {
      return res.status(400).json({ valid: false, error: "No code provided." });
    }

    const valid = getValidCodes().includes(code);

    if (valid) {
      return res.status(200).json({ valid: true });
    }
    return res.status(200).json({ valid: false, error: "Invalid access code." });
  } catch (error) {
    console.error("Verify error:", error);
    return res.status(500).json({ valid: false, error: "Verification failed." });
  }
}