import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedAppPath } from "@/lib/routeAccess";
import { authCompletionDestination } from "@/lib/authReturnPath";
import { isPermanentAuthUser } from "@/lib/authIdentity";

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
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          // A response that carries refreshed auth cookies must never be
          // cached by a CDN or shared cache, or one visitor's session could
          // be served to another. The library supplies the no-store headers.
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value)
          );
        },
      },
    }
  );

  let hasPermanentUser = false;
  try {
    const authResult = await supabase.auth.getUser();
    hasPermanentUser = !authResult.error && isPermanentAuthUser(authResult.data.user);
  } catch {
    // An expired or temporarily unreadable session is a guest for routing.
  }

  const protectedPath = isProtectedAppPath(request.nextUrl.pathname);

  if (request.nextUrl.pathname === "/login" && hasPermanentUser) {
    const mode = request.nextUrl.searchParams.get("mode") === "signup" ? "signup" : "signin";
    const destination = authCompletionDestination(mode, request.nextUrl.searchParams.get("next"));
    return redirectWithRefreshedCookies(new URL(destination, request.url), response);
  }

  if (protectedPath && !hasPermanentUser) {
    const url = request.nextUrl.clone();
    const requestedPath = `${url.pathname}${url.search}`;
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", requestedPath);
    return redirectWithRefreshedCookies(url, response);
  }

  return response;
}

// /resources pages are rendered on the server and read the member's session
// (viewer-specific access labels). Running the proxy there lets an expired
// access token be refreshed and the new cookies saved to the browser, instead
// of the refresh being lost when a Server Component cannot write cookies.
export const config = {
  matcher: ["/login", "/app/:path*", "/admin/:path*", "/resources", "/resources/:path*"],
};
