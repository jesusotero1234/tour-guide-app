import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env';

/**
 * Create Supabase client with service role key for admin operations
 * This client has full database access and should only be used server-side
 */
export const supabaseAdmin: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/**
 * Create Supabase client with anonymous key for public operations
 * This client has limited access based on RLS policies
 */
export const supabasePublic: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
