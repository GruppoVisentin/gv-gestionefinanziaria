import sharp from 'sharp';
import fs from 'fs';

async function padIcon(size) {
  const originalPath = `public/icon-${size}.png`;
  const tempPath = `public/icon-${size}-temp.png`;
  
  // Calculate padding (15% on each side means the inner image is 70% of the total size)
  const innerSize = Math.round(size * 0.7);
  const padding = Math.round(size * 0.15);
  
  try {
    await sharp(originalPath)
      .resize(innerSize, innerSize, { fit: 'contain' })
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 10, g: 22, b: 40, alpha: 1 } // #0a1628
      })
      .toFile(tempPath);
      
    fs.renameSync(tempPath, originalPath);
    console.log(`Successfully padded icon-${size}.png`);
  } catch (e) {
    console.error(`Failed for size ${size}`, e);
  }
}

async function padAppleIcon() {
  const size = 180;
  const originalPath = `public/apple-touch-icon.png`;
  const tempPath = `public/apple-touch-icon-temp.png`;
  
  const innerSize = Math.round(size * 0.7);
  const padding = Math.round(size * 0.15);
  
  try {
    await sharp(originalPath)
      .resize(innerSize, innerSize, { fit: 'contain' })
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 10, g: 22, b: 40, alpha: 1 } // #0a1628
      })
      .toFile(tempPath);
      
    fs.renameSync(tempPath, originalPath);
    console.log(`Successfully padded apple-touch-icon.png`);
  } catch (e) {
    console.error(`Failed for apple touch icon`, e);
  }
}

Promise.all([padIcon(192), padIcon(512), padAppleIcon()]).then(() => {
  console.log('All icons padded successfully.');
});
