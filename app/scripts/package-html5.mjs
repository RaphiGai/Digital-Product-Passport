/**
 * Packages the Vite build output (dist/) into `dpp-ui-content.zip` — the inner
 * "one zip per HTML5 application" bundle that the SAP HTML5 Application Repository
 * expects. The MTA content deployer (com.sap.application.content) then wraps this
 * zip into its own data.zip, giving the required nested structure:
 *
 *   data.zip
 *     └── dpp-ui-content.zip
 *           ├── manifest.json   (sap.app.id / sap.cloud.service)
 *           ├── index.html
 *           ├── consumer.html
 *           └── assets/...
 *
 * mbt does NOT auto-create this zip for a custom-builder html5 module, so we build
 * it explicitly. adm-zip is pure JS (no native binary) → no platform lock issues.
 */
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(appRoot, 'dist');
const outZip = join(appRoot, 'dpp-ui-content.zip');

if (!existsSync(join(distDir, 'manifest.json'))) {
  console.error('package-html5: dist/manifest.json missing — run vite build first.');
  process.exit(1);
}

const zip = new AdmZip();
// addLocalFolder adds the CONTENTS of dist at the zip root (not a dist/ subfolder).
zip.addLocalFolder(distDir);
zip.writeZip(outZip);
console.log(`package-html5: wrote ${outZip}`);
