import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedAppPath } from "@/lib/routeAccess";
import { authCompletionDestination } from "@/lib/authReturnPath";

function redirectWithRefreshedCookies(destination: URL, response: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(destination);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const protectedPath = isProtectedAppPath(request.nextUrl.pathname);

  if (request.nextUrl.pathname === "/login" && user) {
    const mode = request.nextUrl.searchParams.get("mode") === "signup" ? "signup" : "signin";
    const destination = authCompletionDestination(mode, request.nextUrl.searchParams.get("next"));
    return redirectWithRefreshedCookies(new URL(destination, request.url), response);
  }

  if (protectedPath && !user) {
    const url = request.nextUrl.clone();
    const requestedPath = `${url.pathname}${url.search}`;
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", requestedPath);
    return redirectWithRefreshedCookies(url, response);
  }

  return response;
}

export const config = {
  matcher: ["/login", "/app/:path*", "/admin/:path*"],
};
