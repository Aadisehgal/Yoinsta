import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats numbers the Indian way: 1,20,000 instead of 120,000 (spec section 9). */
export function formatIndianNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}
