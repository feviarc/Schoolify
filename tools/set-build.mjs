// Sello de build automatico: YYMMDDHHmm escrito en src/app/app-info.ts antes de
// cada `npm run build`. Asi el numero no se queda atras ni hay que editarlo a
// mano; la version sigue siendo manual en el mismo archivo.
import { readFileSync, writeFileSync } from 'node:fs';

const APP_INFO = new URL('../src/app/app-info.ts', import.meta.url);
const PATTERN = /export const APP_BUILD = '[^']*';/;

const pad = (value) => String(value).padStart(2, '0');
const now = new Date();
const stamp = [
  String(now.getFullYear()).slice(-2),
  pad(now.getMonth() + 1),
  pad(now.getDate()),
  pad(now.getHours()),
  pad(now.getMinutes()),
].join('');

const source = readFileSync(APP_INFO, 'utf8');

if (!PATTERN.test(source)) {
  console.error('🛑 No se encontro APP_BUILD en src/app/app-info.ts');
  process.exit(1);
}

writeFileSync(APP_INFO, source.replace(PATTERN, `export const APP_BUILD = '${stamp}';`));
console.log(`Build actualizado: ${stamp}`);
