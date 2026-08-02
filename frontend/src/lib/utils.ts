import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Shared FieldLabel styling - two sizes used across the app: auth/account
// forms (formLabelClass) and search/booking forms (compactLabelClass).
export const formLabelClass =
  "font-mono text-[11px] tracking-widest text-muted-foreground"
export const compactLabelClass =
  "font-mono text-[10px] tracking-[0.2em] text-muted-foreground"
