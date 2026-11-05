// Vite's `?raw` imports (used by tests to read source files as strings).
declare module '*?raw' {
  const content: string;
  export default content;
}
