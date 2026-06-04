import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const workspacePackage = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    globals: false
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
    alias: [
      { find: '@polyshore/core', replacement: workspacePackage('core') },
      { find: '@polyshore/config', replacement: workspacePackage('config') },
      { find: '@polyshore/db', replacement: workspacePackage('db') },
      { find: '@polyshore/venues', replacement: workspacePackage('venues') },
      { find: '@polyshore/scanner', replacement: workspacePackage('scanner') },
      { find: '@polyshore/features', replacement: workspacePackage('features') },
      { find: '@polyshore/research', replacement: workspacePackage('research') },
      { find: '@polyshore/models', replacement: workspacePackage('models') },
      { find: '@polyshore/portfolio', replacement: workspacePackage('portfolio') },
      { find: '@polyshore/risk', replacement: workspacePackage('risk') },
      { find: '@polyshore/execution', replacement: workspacePackage('execution') },
      { find: '@polyshore/reconciliation', replacement: workspacePackage('reconciliation') },
      { find: '@polyshore/audit', replacement: workspacePackage('audit') },
      { find: '@polyshore/alerts', replacement: workspacePackage('alerts') },
      { find: '@polyshore/api', replacement: workspacePackage('api') },
      { find: '@polyshore/auth', replacement: workspacePackage('auth') },
      { find: '@polyshore/reports', replacement: workspacePackage('reports') },
      { find: '@polyshore/simulations', replacement: workspacePackage('simulations') },
      { find: '@polyshore/observability', replacement: workspacePackage('observability') }
    ]
  }
});
