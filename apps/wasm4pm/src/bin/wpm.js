#!/usr/bin/env node
import { runMain } from 'citty';
import { main } from '../cli.js';
/**
 * wasm4pm CLI entry point
 * Parses command-line arguments and routes to appropriate command handler
 */
runMain(main).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(5);
});
//# sourceMappingURL=wasm4pm.js.map