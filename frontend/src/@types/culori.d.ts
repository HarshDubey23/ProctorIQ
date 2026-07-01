declare module 'culori' {
  export function interpolate(
    colors: string[],
    mode?: string,
  ): (t: number) => string;

  export function formatHex(color: string): string;

  export function samples(n: number): number[];
}
