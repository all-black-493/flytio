import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in — flyt.io" };

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}
