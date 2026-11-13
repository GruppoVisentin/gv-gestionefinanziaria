// Rigenera icon-192 e apple-touch-icon dal MASTER valido icon-512-v11.png (unico file del set
// -v11 che decodifica correttamente i pixel — icon-192-v11.png e apple-touch-icon-v11.png sono
// invece PNG troncati: l'header si legge ma sharp fallisce con "vipspng: libpng read error" sulla
// decodifica dei pixel, verificato il 2026-11-12). Derivare le altre dimensioni per resize dal
// master gia' arrotondato evita di dover reimplementare la maschera ad angoli arrotondati: il
// risultato ha lo stesso stile, non solo "arrotondato in modo diverso".
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs';

const MASTER = 'public/icon-512-v11.png';
const SUFFIX = '-v12';

async function main() {
  await sharp(MASTER).resize(192, 192).toFile(`public/icon-192${SUFFIX}.png`);
  await sharp(MASTER).resize(180, 180).toFile(`public/apple-touch-icon${SUFFIX}.png`);
  await sharp(MASTER).toFile(`public/icon-512${SUFFIX}.png`);
  console.log('Icone rigenerate (192, 180, 512) dal master valido.');

  // png-to-ico con UN SOLO path (come faceva il vecchio make_ico.js) produce un .ico apparentemente
  // valido ma con dimensioni interne inconsistenti — passargli esplicitamente le dimensioni
  // standard di un favicon (16/32/48/256), gia' ridimensionate con sharp, e' il modo corretto e
  // documentato dalla libreria stessa.
  const dimensioniIco = [16, 32, 48, 256];
  const pathIco = [];
  for (const s of dimensioniIco) {
    const p = `/tmp/favicon-src-${s}.png`;
    await sharp(MASTER).resize(s, s).toFile(p);
    pathIco.push(p);
  }
  const icoBuf = await pngToIco(pathIco);
  fs.writeFileSync('public/favicon.ico', icoBuf);
  for (const p of pathIco) fs.unlinkSync(p);
  console.log('favicon.ico rigenerato (16/32/48/256) dallo stesso master arrotondato.');

  // Verifica: tutti i nuovi file devono decodificare senza errori (stesso controllo che ha
  // scoperto la corruzione dei -v11).
  for (const f of [`public/icon-192${SUFFIX}.png`, `public/apple-touch-icon${SUFFIX}.png`, `public/icon-512${SUFFIX}.png`]) {
    const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha0 = data[3];
    console.log(`  ${f}: OK (${info.width}x${info.height}, angolo alpha=${alpha0})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
