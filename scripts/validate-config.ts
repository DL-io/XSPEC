import { validateConfigFromEnvFile } from '@polyshore/config';

try {
  console.log(JSON.stringify(validateConfigFromEnvFile()));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid runtime configuration');
  process.exitCode = 1;
}
