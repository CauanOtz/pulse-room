import { createServer } from './app.js';
import { loadConfiguration } from './config.js';

async function start(): Promise<void> {
  const configuration = loadConfiguration();
  const server = await createServer(configuration);
  await server.listen({ port: configuration.PORT, host: configuration.HOST });
}

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
