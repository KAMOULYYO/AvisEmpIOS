import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const hasUrl = Boolean(supabaseUrl);
const hasKey = Boolean(supabaseAnonKey);

export const supabaseConfigErrors = [
  !hasUrl ? 'VITE_SUPABASE_URL manquant.' : '',
  !hasKey ? 'VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY) manquant.' : ''
].filter(Boolean);

export const supabaseReady = hasUrl && hasKey;

export const supabase = supabaseReady
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
