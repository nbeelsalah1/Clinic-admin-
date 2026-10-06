declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_DATA_KEY?: string;
    OPENAI_API_KEY?: string;
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    QREDIT_API_KEY?: string;
    QREDIT_SECRET_KEY?: string;
  }
}
