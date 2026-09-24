"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/supabase/env";

export function createClient() {
  const env = supabaseEnv();
  if (!env) throw new Error("Supabase não configurado");
  return createBrowserClient(env.url, env.key);
}
