// Supabase client configuration
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://aghwnarcwhdlpslodxxd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnaHduYXJjd2hkbHBzbG9keHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3OTI5NjcsImV4cCI6MjA4MzM2ODk2N30.tn7yg567ucIfHnMmpVGrBIN-pDLOYzu1RsPGTnp6P8E";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
