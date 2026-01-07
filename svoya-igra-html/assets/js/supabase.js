// assets/js/supabase.js
// ВАЖНО: Supabase SDK должен быть подключён в HTML ПЕРЕД этим файлом

const SUPABASE_URL = "https://sqkfcjshyckelrlnrrln.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxa2ZjanNoeWNrZWxybG5ycmxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczMTYwNTUsImV4cCI6MjA4Mjg5MjA1NX0.FurC62l12jhcpqUqy5aglvQV29AtpMJkcrRcbb1cdBY";

window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("✅ Supabase подключён", window.supabase);
