/**
 * Reads a colour token (`--color-<name>` from styles.css) at runtime, for renderers that cannot take a CSS
 * variable: MapLibre paint properties, WebGL uniforms and SVG markers. Falls back to the variable itself where
 * no stylesheet is loaded (unit tests).
 */
export function colorToken(name: string): string {
  const value =
    typeof document === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
  return value || `var(--color-${name})`;
}
