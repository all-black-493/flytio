import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { isAuthenticated } from "@/lib/auth/session";

export const metadata = { title: "Sign in — flyt" };

interface PageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { next, error } = await searchParams;
  if (await isAuthenticated()) redirect(next || "/");
  return <LoginForm next={next} error={error} />;
}
