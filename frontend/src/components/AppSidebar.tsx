import Link from "next/link";
import {
  Briefcase,
  ChevronDown,
  Code2,
  LogIn,
  PlaneTakeoff,
  Search,
  User,
  UserPlus,
} from "lucide-react";
import Logo, { LogoMark } from "@/components/Logo";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { isAuthenticated } from "@/lib/auth/session";

const TRAVEL_GROUP = {
  label: "TRAVEL",
  items: [
    { title: "Search flights", href: "/search", icon: Search },
    { title: "Departures", href: "/#board", icon: PlaneTakeoff },
  ],
};

const BUSINESS_GROUP = {
  label: "BUSINESS",
  items: [
    { title: "For business", href: "/#business", icon: Briefcase },
    { title: "API access", href: "/#business", icon: Code2 },
  ],
};

const SIGNED_OUT_ITEMS = [
  { title: "Sign in", href: "/login", icon: LogIn },
  { title: "Create account", href: "/register", icon: UserPlus },
];

const SIGNED_IN_ITEMS = [{ title: "Profile", href: "/account", icon: User }];

export default async function AppSidebar() {
  const authed = await isAuthenticated();

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
        {[TRAVEL_GROUP, BUSINESS_GROUP].map((group) => (
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

        <Collapsible defaultOpen>
          <SidebarGroup>
            <SidebarGroupLabel
              render={<CollapsibleTrigger />}
              className="w-full font-mono tracking-[0.2em] text-[10px]"
            >
              ACCOUNT
              <ChevronDown className="ml-auto transition-transform in-data-panel-open:rotate-180" />
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {(authed ? SIGNED_IN_ITEMS : SIGNED_OUT_ITEMS).map((item) => (
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
                  {authed && (
                    <SidebarMenuItem>
                      <LogoutButton />
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
