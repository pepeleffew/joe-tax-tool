/* Supabase connection for the live layer (uploads, guestbook, RSVP, logins).
 * The anon key is a PUBLIC key — it is designed to live in browser code and
 * only permits what the database's Row Level Security policies allow.
 * Admin powers (approving photos/messages) are granted to adminEmail below. */
window.SUPA_CONFIG = {
  url: "https://vfeazjbvskzgmpfrenur.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmZWF6amJ2c2t6Z21wZnJlbnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NTcyOTksImV4cCI6MjEwMTAzMzI5OX0.2WszAYY_uy9SukhATyAmRpKl7vokJpoeHgjGmYvhsCg",
  // Sign in with this email on the site to unlock the admin approval panel.
  adminEmail: "joe.c.leffew@gmail.com"
};
