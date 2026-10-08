import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

// The publishable/anon key is intended for browser use. Database access is
// still enforced by Supabase RLS; never put a service_role key here.
export const supabaseUrl = environment.supabaseUrl;
export const supabaseAnonKey = environment.supabaseAnonKey;

export const supabaseConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !supabaseUrl.includes('YOUR_PROJECT') &&
  !supabaseAnonKey.includes('YOUR_SUPABASE');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});
