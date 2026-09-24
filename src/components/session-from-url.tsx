"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function SessionFromUrl() {
  const router = useRouter();

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    const hasToken = url.hash.includes("access_token");
    if (!code && !tokenHash && !hasToken) return;

    const supabase = createClient();

    async function finish() {
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
        if (error) return;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) return;
      } else {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) return;
      }

      window.history.replaceState({}, "", "/");
      router.replace("/");
      router.refresh();
    }

    void finish();
  }, [router]);

  return null;
}
