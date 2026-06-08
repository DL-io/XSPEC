import { defineConfig } from 'vitest/config';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface WorkspaceManifest {
  name?: string;
  main?: string;
}

const workspaceRoots = ['./packages', './workers'];

function workspaceAliases() {
  return workspaceRoots.flatMap((root) => {
    const rootPath = fileURLToPath(new URL(root, import.meta.url));
    if (!existsSync(rootPath)) return [];

    return readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) return [];
      const manifestPath = new URL(`${root}/${entry.name}/package.json`, import.meta.url);
      if (!existsSync(manifestPath)) return [];

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as WorkspaceManifest;
      if (!manifest.name?.startsWith('@polyshore/')) return [];

      const entryFile = new URL(`${root}/${entry.name}/${manifest.main ?? './src/index.ts'}`, import.meta.url);
      if (!existsSync(entryFile)) return [];

      return [{ find: manifest.name, replacement: fileURLToPath(entryFile) }];
    });
  });
}

export default defineConfig({
  test: {
    pool: 'forks',
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.integration.test.ts',
      'apps/**/*.test.ts',
      'apps/**/*.integration.test.ts',
      'workers/**/*.test.ts',
      'workers/**/*.integration.test.ts'
    ],
    globals: false
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
    alias: workspaceAliases()
  }
});
