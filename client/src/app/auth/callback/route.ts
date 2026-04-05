import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../utils/supabase/server";

const redirectWithError = (request: NextRequest, errorCode: string) => {
  const url = new URL("/", request.url);
  url.searchParams.set("error", errorCode);
  return NextResponse.redirect(url);
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const authError =
    requestUrl.searchParams.get("error") ??
    requestUrl.searchParams.get("error_code");

  if (authError) {
    return redirectWithError(request, "google_auth_failed");
  }

  if (!code) {
    return redirectWithError(request, "google_auth_missing_code");
  }

  try {
    const supabase = createClient(await cookies());
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Supabase auth callback exchange failed:", error.message);
      return redirectWithError(request, "google_auth_failed");
    }

    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  } catch (error) {
    console.error("Supabase auth callback crashed:", error);
    return redirectWithError(request, "google_auth_failed");
  }
}
