// Vitest (Vite) resolves `import.meta.glob` at build time: the fixture tests load markdown files with it.
interface ImportMeta {
  glob(
    pattern: string,
    options: { query: string; import: string; eager: true },
  ): Record<string, unknown>;
}
