// NOTA (2026-11-12): icon-512-v10.png e' il vecchio master QUADRATO (senza angoli arrotondati,
// sostituito da icon-512-v11.png/v12.png). Usa rigenera_icone_rotonde.js per rigenerare
// favicon.ico insieme alle altre icone dal master arrotondato corrente — passare a questo script
// un solo path produce anche un .ico "valido" ma con dimensioni interne inconsistenti (va passato
// un array di PNG gia' ridimensionati a 16/32/48/256, come fa rigenera_icone_rotonde.js).
import pngToIco from 'png-to-ico';
import fs from 'fs';

pngToIco('public/icon-512-v10.png')
  .then(buf => {
    fs.writeFileSync('public/favicon.ico', buf);
    console.log('favicon.ico created successfully');
  })
  .catch(console.error);
