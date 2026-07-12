import { addCommand } from './add';
import { readCliContext } from './context';
import { copyCommand } from './copy';
import { openCommand, runCommand } from './launch';
import { fail } from './log';
import { updateCommand } from './update';
import { vendorCommand } from './vendor';

async function main(): Promise<void> {
  const [, , command] = process.argv;
  if (command === 'vendor') {
    // Invoked from the scaffolded `pack` script (cwd = electron/); needs no
    // Capacitor CLI environment.
    vendorCommand();
    return;
  }
  const context = readCliContext();
  switch (command) {
    case 'add':
      return addCommand(context);
    case 'copy':
      return copyCommand(context);
    case 'update':
      return updateCommand(context);
    case 'open':
      return openCommand(context);
    case 'run':
      return runCommand(context);
    default:
      fail(`Unknown command: ${command ?? '(none)'}`);
  }
}

main().catch(error => {
  fail(error instanceof Error ? error.message : String(error));
});
