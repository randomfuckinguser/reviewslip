import {
  call,
  clearSessionCookie,
  sessionToken,
  setSessionCookie,
  type Session,
} from "@/lib/customer";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

/**
 * Sign in and sign up, for the auth form to post to.
 *
 * A route handler rather than a Server Action because AuthForm is a client
 * component that already posts JSON to a single endpoint — this fills the seam
 * it was built with instead of rewriting it.
 *
 * The password reaches this handler and goes no further than the review app.
 * The session token it returns is put straight into an httpOnly cookie and is
 * never sent to the browser in the response body.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }

  const mode = body.mode === "signup" ? "signup" : "login";
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const asked = typeof body.lang === "string" ? body.lang : "";
  const lang = isLocale(asked) ? asked : DEFAULT_LOCALE;
  const referralCode = String(body.referralCode ?? "").trim().slice(0, 32);

  try {
    const session = await call<Session>(`/${mode}`, {
      method: "POST",
      body:
        mode === "signup"
          ? // No username field on the form; the review app derives one from
            // the email. `name` is the person, not the account, so it is not
            // sent as a username.
            //
            // The referral code rides along unvalidated on purpose. The review
            // app is the only place that knows which codes exist, and a code it
            // rejects must never stop an account being created — so there is
            // nothing useful to check here, and checking would only add a way
            // to fail.
            { email, password, referralCode }
          : { identifier: email, password },
    });

    await setSessionCookie(session.token);

    // Signing in on the staff host lands on the staff host's own root, not on
    // /dashboard — which does not exist there, because proxy.ts maps every path
    // on that host under /admin. The cookie just set is host-only, so this is
    // also a session that exists only here.
    const host = request.headers.get("host")?.split(":")[0].toLowerCase() ?? "";
    const redirect = host.startsWith("admin.")
      ? "/"
      : localizedPath(lang, "/dashboard");

    return Response.json({ redirect });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Something went wrong.",
      },
      // 401 and 409 are the caller's to fix — a wrong password, an email
      // already registered — and the form shows the message as-is.
      { status }
    );
  }
}

/**
 * Sign out.
 *
 * Both halves, in this order: end the session on the review app, then drop the
 * cookie. Dropping only the cookie would leave a live token in the sessions
 * table for a day, valid for anybody who had copied it.
 *
 * The cookie goes even when the review app cannot be reached. Somebody who
 * pressed Sign Out and is still signed in has been told something untrue, and
 * the row they leave behind expires on its own.
 */
export async function DELETE() {
  const token = await sessionToken();

  if (token) {
    try {
      await call('/logout', { method: 'POST', token });
    } catch (err) {
      console.error('Sign out could not end the session on the review app:', err);
    }
  }

  await clearSessionCookie();
  return Response.json({ ok: true });
}
