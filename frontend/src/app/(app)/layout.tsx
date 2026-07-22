import AppSidebar from "@/components/AppSidebar";
import Logo from "@/components/Logo";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import Link from "next/link";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-background/80 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none">
          <SidebarTrigger aria-label="Toggle sidebar" />
          <Link href="/" className="md:hidden">
            <Logo size="sm" />
          </Link>
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
