import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canVisit, homeFor, normalizeMenus, normalizeRole } from "@/lib/roles";
import { supabaseEnv } from "@/lib/supabase/env";
import { browserSessionOptions } from "@/lib/supabase/session-cookie";

const publicPaths = new Set(["/login", "/recuperar", "/api/health"]);

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
          response.cookies.set(name, value, browserSessionOptions(options));
        });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  if (pathname === "/cadastro") {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return dropPersistentSession(redirect, request);
  }

  const isPublic = publicPaths.has(pathname);
  const recoveryReset = pathname === "/recuperar/nova-senha";

  if (!data.user && !isPublic && !recoveryReset) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.search = request.nextUrl.search;
    const redirect = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return dropPersistentSession(redirect, request);
  }

  if (data.user && isPublic && !recoveryReset) {
    const { data: profile } = await supabase.from("profiles").select("role, menus, tenants(status)").eq("id", data.user.id).maybeSingle();
    if (shopStatus(profile?.tenants) === "suspended") {
      await supabase.auth.signOut();
      const redirect = NextResponse.redirect(new URL("/login?aviso=suspensa", request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return dropPersistentSession(redirect, request);
    }
    const redirect = NextResponse.redirect(new URL(homeFor(normalizeRole(profile?.role), normalizeMenus(profile?.menus)), request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return dropPersistentSession(redirect, request);
  }

  if (data.user && !recoveryReset) {
    const { data: profile } = await supabase.from("profiles").select("role, menus, tenants(status)").eq("id", data.user.id).maybeSingle();
    if (shopStatus(profile?.tenants) === "suspended") {
      await supabase.auth.signOut();
      const redirect = NextResponse.redirect(new URL("/login?aviso=suspensa", request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return dropPersistentSession(redirect, request);
    }
    const role = normalizeRole(profile?.role);
    const menus = normalizeMenus(profile?.menus);
    if (!canVisit(role, menus, pathname)) {
      const redirect = NextResponse.redirect(new URL(homeFor(role, menus), request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return dropPersistentSession(redirect, request);
    }
  }

  return dropPersistentSession(response, request);
}

function shopStatus(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (row && typeof row === "object" && "status" in row && typeof row.status === "string") return row.status;
  return null;
}

function dropPersistentSession(response: NextResponse, request: NextRequest) {
  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith("sb-") || !cookie.value) continue;
    response.cookies.set(cookie.name, cookie.value, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
