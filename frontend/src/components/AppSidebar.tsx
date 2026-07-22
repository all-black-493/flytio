"use client";

import Link from "next/link";
import {
  Briefcase,
  ChevronDown,
  Code2,
  LogIn,
  PlaneTakeoff,
  Search,
  UserPlus,
} from "lucide-react";
import Logo, { LogoMark } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const GROUPS = [
  {
    label: "TRAVEL",
    items: [
      { title: "Search flights", href: "/#search", icon: Search },
      { title: "Departures", href: "/#board", icon: PlaneTakeoff },
    ],
  },
  {
    label: "BUSINESS",
    items: [
      { title: "For business", href: "/#business", icon: Briefcase },
      { title: "API access", href: "/#business", icon: Code2 },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      { title: "Sign in", href: "/login", icon: LogIn },
      { title: "Create account", href: "/register", icon: UserPlus },
    ],
  },
];

export default function AppSidebar() {
  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <Link href="/" className="flex items-center px-1 py-1.5">
          <span className="group-data-[collapsible=icon]:hidden">
            <Logo size="sm" />
          </span>
          <span className="hidden group-data-[collapsible=icon]:inline-flex">
            <LogoMark size={26} />
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {GROUPS.map((group) => (
          <Collapsible key={group.label} defaultOpen>
            <SidebarGroup>
              <SidebarGroupLabel
                render={<CollapsibleTrigger />}
                className="w-full font-mono tracking-[0.2em] text-[10px]"
              >
                {group.label}
                <ChevronDown className="ml-auto transition-transform in-data-panel-open:rotate-180" />
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          render={<Link href={item.href} />}
                          tooltip={item.title}
                        >
                          <item.icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="group-data-[collapsible=icon]:hidden px-1 pb-1">
          <ThemeToggle />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
