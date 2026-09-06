// ---- Supabase configuration (safe for the browser) ----
// These two values are used by register.html, login.html, and app.html.
//
// The anon key is a PUBLIC key — it is safe to expose in the browser BECAUSE
// Row Level Security (RLS) is enabled on your tables (we set this up in SQL).
//
// 👉 PASTE YOUR LEGACY ANON KEY BELOW (the long one that starts with "eyJ...").
//    Supabase dashboard → Settings → API → "Legacy anon, service_role API keys" → anon public

const SUPABASE_URL = "https://cemevzlthoxoimgngdbx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlbWV2emx0aG94b2ltZ25nZGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2ODIzNzUsImV4cCI6MjEwNDI1ODM3NX0.NRK47tQv0jYnHNbStHvnhzRUZAFLzvTzTvnJaRp2hP8";