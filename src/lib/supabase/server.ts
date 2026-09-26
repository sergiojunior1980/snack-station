import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/supabase/env";
import { browserSessionOptions } from "@/lib/supabase/session-cookie";

export async function createClient() {
  const env = supabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();

  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, browserSessionOptions(options));
          });
        } catch {
          // Server Components não podem gravar cookie; o proxy renova a sessão.
        }
      },
    },
  });
}
