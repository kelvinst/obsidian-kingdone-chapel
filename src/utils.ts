/** Escape a string for safe use inside a RegExp. */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function pad3(n: number): string {
  return String(n).padStart(3, '0');
}
