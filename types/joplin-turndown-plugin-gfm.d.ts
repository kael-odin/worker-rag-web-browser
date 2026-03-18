declare module 'joplin-turndown-plugin-gfm' {
  export function gfm(markdown: string): string;
  export function strikethrough(markdown: string): string;
  export function table(markdown: string): string;
  export default { gfm, strikethrough, table };
}
