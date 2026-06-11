const e = process.env;

const shared = {
  NODE_ENV: 'production',
  TRUST_OPERATOR_ROLE_HEADERS: 'true',
  // Research providers — inherited from shell env (sourced from .env in XSPEC.command)
  OLLAMA_BASE_URL: e.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  OLLAMA_MODEL: e.OLLAMA_MODEL ?? 'gemma3:27b',
  GROQ_API_KEY: e.GROQ_API_KEY ?? '',
  GROQ_MODEL: e.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
  GEMINI_API_KEY: e.GEMINI_API_KEY ?? '',
  GEMINI_MODEL: e.GEMINI_MODEL ?? 'gemini-2.5-flash',
  OPENAI_API_KEY: e.OPENAI_API_KEY ?? '',
  ANTHROPIC_API_KEY: e.ANTHROPIC_API_KEY ?? '',
  TAVILY_API_KEY: e.TAVILY_API_KEY ?? '',
};

module.exports = {
  apps: [
    { name: 'polyshore-terminal', script: 'pnpm', args: '--filter @polyshore/terminal start', env: shared },
    { name: 'polyshore-scanner', script: 'pnpm', args: '--filter @polyshore/scanner-worker start', env: shared },
    { name: 'polyshore-research', script: 'pnpm', args: '--filter @polyshore/research-worker start', env: shared },
    { name: 'polyshore-execution', script: 'pnpm', args: '--filter @polyshore/execution-worker start', env: shared },
    { name: 'polyshore-reconciliation', script: 'pnpm', args: '--filter @polyshore/reconciliation-worker start', env: shared },
    { name: 'polyshore-calibration', script: 'pnpm', args: '--filter @polyshore/calibration-worker start', env: shared },
    { name: 'polyshore-alerts', script: 'pnpm', args: '--filter @polyshore/alert-worker start', env: shared }
  ]
};
