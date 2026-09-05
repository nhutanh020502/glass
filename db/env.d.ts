type D1PreparedStatement = import('./supabase').PreparedStatement;
type D1Database = import('./supabase').DatabaseAdapter;

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
  }
}
