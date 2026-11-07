import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely formats a number, returning "0" if the value is NaN or invalid
 */
export function safeFormatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0"
  const num = typeof value === "string" ? Number.parseFloat(value) : value
  if (isNaN(num) || !isFinite(num)) return "0"
  return String(num)
}
