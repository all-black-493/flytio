import TopNav from "@/components/TopNav";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <TopNav />
      {children}
    </div>
  );
}
