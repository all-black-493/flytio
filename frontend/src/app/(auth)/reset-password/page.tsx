import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { isAuthenticated } from "@/lib/auth/session";

export const metadata = { title: "Reset password — flyt" };

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  // Already-signed-in users have a change-password flow on /account
  // (ProfileCard's ChangePasswordForm) - the token-based reset here is
  // for a logged-out visitor, so a live session takes precedence.
  if (await isAuthenticated()) redirect("/account");
  const { token } = await searchParams;
  return <ResetPasswordForm token={token} />;
}
