import sharp from 'sharp';
import fs from 'fs';

async function processIcon(size, newSuffix) {
  const originalPath = `public/icon-${size}.png`;
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
        background: { r: 37, g: 99, b: 235, alpha: 1 } // Solid blue
      })
      .flatten({ background: { r: 37, g: 99, b: 235 } }) // Fill transparent pixels with blue
      .ensureAlpha() // FORCE 32-bit RGBA PNG (Required for Chrome PWA shortcuts)
      .resize(size, size)
      .toFile(targetPath);
      
    console.log(`Successfully processed icon-${size}.png to 32-bit RGBA`);
  } catch (e) {
    console.error(`Failed for size ${size}`, e);
  }
}

async function processAppleIcon(newSuffix) {
  const size = 180;
  const originalPath = `public/apple-touch-icon.png`;
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
        background: { r: 37, g: 99, b: 235, alpha: 1 }
      })
      .flatten({ background: { r: 37, g: 99, b: 235 } })
      .ensureAlpha()
      .resize(size, size)
      .toFile(targetPath);
      
    console.log(`Successfully processed apple-touch-icon.png to 32-bit RGBA`);
  } catch (e) {
    console.error(`Failed for apple touch icon`, e);
  }
}

Promise.all([
  processIcon(192, '-v7'),
  processIcon(512, '-v7'),
  processAppleIcon('-v7')
]).then(() => {
  console.log('All icons processed successfully.');
});
