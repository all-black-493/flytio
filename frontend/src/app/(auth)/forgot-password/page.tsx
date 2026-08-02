import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { isAuthenticated } from "@/lib/auth/session";

export const metadata = { title: "Forgot password — flyt" };

export default async function ForgotPasswordPage() {
  if (await isAuthenticated()) redirect("/");
  return <ForgotPasswordForm />;
}
