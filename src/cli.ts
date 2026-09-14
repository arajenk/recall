import { main } from './server.ts';
import { runSetup } from './setup.ts';
import { runUninstall } from './uninstall.ts';

async function run(): Promise<void> {
  const command = process.argv[2];

  if (command === undefined) {
    await main();
  } else if (command === 'setup') {
    await runSetup();
  } else if (command === 'uninstall') {
    await runUninstall();
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Usage: recall-vault [setup|uninstall]');
    process.exit(1);
  }
}

// Only when run directly, same guard server.ts uses so importing this file
// for tests never starts the server or runs setup/uninstall as a side effect.
if (import.meta.main) {
  run().catch((error) => {
    console.error('recall-vault failed:', error);
    process.exit(1);
  });
}
