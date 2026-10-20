import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';
import { catalog } from './src/site/knowledge/catalog';

/** Publica el contenido para lectores sin JavaScript. */
export function knowledgeDocs(): Plugin {
  return {
    name: 'knowledge-docs',
    apply: 'build',
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'llms/catalog.json',
        source: JSON.stringify(catalog, null, 2),
      });
      for (const article of catalog) {
        const body = await readFile(
          new URL(`./src/site/knowledge/content/en/${article.slug}.md`, import.meta.url),
          'utf8',
        );
        this.emitFile({
          type: 'asset',
          fileName: `llms/knowledge/${article.slug}.md`,
          source: `# ${article.title}\n\n> ${article.summary}\n\n${body}`,
        });
      }
    },
  };
}
