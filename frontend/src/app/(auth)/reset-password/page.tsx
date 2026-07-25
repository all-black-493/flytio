import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Reset password — flyt.io" };

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={token} />;
}
