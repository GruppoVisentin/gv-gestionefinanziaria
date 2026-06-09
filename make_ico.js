import pngToIco from 'png-to-ico';
import fs from 'fs';

pngToIco('public/icon-512-v10.png')
  .then(buf => {
    fs.writeFileSync('public/favicon.ico', buf);
    console.log('favicon.ico created successfully');
  })
  .catch(console.error);
