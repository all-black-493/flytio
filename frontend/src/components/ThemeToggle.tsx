"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes resolves the theme synchronously on the client (via its
  // anti-flash script) before hydration finishes, so resolvedTheme is
  // already defined by the time React hydrates - reading it directly
  // still mismatches the server's render, which never knows the stored
  // preference. useMounted() is the hydration-safe "has the client render
  // actually settled" flag.
  const mounted = useMounted();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      disabled={!mounted}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
