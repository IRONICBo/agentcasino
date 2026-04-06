import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser-only client (anon key, no service role)
// Used for Realtime subscriptions — no sensitive data access
export const supabaseBrowser = createClient(url, anonKey);
