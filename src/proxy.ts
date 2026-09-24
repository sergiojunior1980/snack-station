import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homeFor, normalizeRole, sellerCanVisit } from "@/lib/roles";
import { supabaseEnv } from "@/lib/supabase/env";

const publicPaths = new Set(["/login", "/api/health"]);

export async function proxy(request: NextRequest) {
  const env = supabaseEnv();
  if (!env) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  if (pathname === "/cadastro") {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  const isPublic = publicPaths.has(pathname);

  if (!data.user && !isPublic) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.search = request.nextUrl.search;
    const redirect = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (data.user && isPublic) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    const redirect = NextResponse.redirect(new URL(homeFor(normalizeRole(profile?.role)), request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (data.user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    const role = normalizeRole(profile?.role);
    if (role !== "admin" && !sellerCanVisit(pathname)) {
      const redirect = NextResponse.redirect(new URL("/vendas", request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
