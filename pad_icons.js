import sharp from 'sharp';
import fs from 'fs';

async function processIcon(size, oldSuffix, newSuffix) {
  const originalPath = `public/icon-${size}${oldSuffix}.png`;
  const targetPath = `public/icon-${size}${newSuffix}.png`;
  
  const innerSize = Math.round(size * 0.8);
  const padding = Math.round((size - innerSize) / 2);
  
  try {
    await sharp(originalPath)
      .resize(innerSize, innerSize, { fit: 'contain' })
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 37, g: 99, b: 235, alpha: 1 } // un bel blu, tipo #2563eb
      })
      .flatten({ background: { r: 37, g: 99, b: 235 } }) 
      .resize(size, size) // force exact size in case of rounding errors
      .toFile(targetPath);
      
    console.log(`Successfully processed icon-${size}.png`);
  } catch (e) {
    console.error(`Failed for size ${size}`, e);
  }
}

async function processAppleIcon(oldSuffix, newSuffix) {
  const size = 180;
  const originalPath = `public/apple-touch-icon${oldSuffix}.png`;
  const targetPath = `public/apple-touch-icon${newSuffix}.png`;
  
  const innerSize = Math.round(size * 0.8);
  const padding = Math.round((size - innerSize) / 2);
  
  try {
    await sharp(originalPath)
      .resize(innerSize, innerSize, { fit: 'contain' })
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 37, g: 99, b: 235, alpha: 1 } // #2563eb
      })
      .flatten({ background: { r: 37, g: 99, b: 235 } })
      .resize(size, size)
      .toFile(targetPath);
      
    console.log(`Successfully processed apple-touch-icon.png`);
  } catch (e) {
    console.error(`Failed for apple touch icon`, e);
  }
}

Promise.all([
  processIcon(192, '-v5', '-v6'),
  processIcon(512, '-v5', '-v6'),
  processAppleIcon('-v5', '-v6')
]).then(() => {
  console.log('All icons processed successfully.');
});
