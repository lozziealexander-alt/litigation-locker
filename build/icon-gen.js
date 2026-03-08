const sharp = require('sharp');
const path = require('path');

const SIZE = 1024;
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
    <linearGradient id="shield" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#c9a84c"/>
      <stop offset="100%" style="stop-color:#a07c30"/>
    </linearGradient>
  </defs>

  <!-- Rounded square background -->
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="220" ry="220" fill="url(#bg)"/>

  <!-- Shield shape -->
  <path d="M 512 180
           L 740 280
           Q 750 285 750 296
           L 750 520
           Q 750 640 660 730
           L 530 844
           Q 512 860 494 844
           L 364 730
           Q 274 640 274 520
           L 274 296
           Q 274 285 284 280
           Z"
        fill="none" stroke="url(#shield)" stroke-width="32" stroke-linejoin="round"/>

  <!-- Keyhole circle -->
  <circle cx="512" cy="480" r="72" fill="url(#shield)"/>

  <!-- Keyhole slot -->
  <path d="M 488 530 L 512 680 L 536 530" fill="url(#shield)"/>
</svg>`;

(async () => {
  const pngPath = path.join(__dirname, 'icon.png');
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  console.log('Created icon.png at', pngPath);
})();
