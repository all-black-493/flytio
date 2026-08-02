import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { isAuthenticated } from "@/lib/auth/session";

export const metadata = { title: "Create account — flyt" };

export default async function RegisterPage() {
  if (await isAuthenticated()) redirect("/");
  return <RegisterForm />;
}
