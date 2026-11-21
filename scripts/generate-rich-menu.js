/**
 * PakMaii LINE OA Rich Menu Generator
 * Generates exact 2500 x 1686 px artwork (< 1 MB) aligned to LINE OA Manager Template 1 (6 blocks: 3x2).
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const ROOT_DIR = process.cwd();
const FONTS_DIR = path.join(ROOT_DIR, 'public', 'fonts');
const OUT_DIR = path.join(ROOT_DIR, 'assets', 'line-oa');
const PNG_PATH = path.join(OUT_DIR, 'pakmaii-rich-menu-2500x1686.png');
const JPG_PATH = path.join(OUT_DIR, 'pakmaii-rich-menu-2500x1686.jpg');

const WIDTH = 2500;
const HEIGHT = 1686;
const MAX_LINE_BYTES = 1048576; // 1 MB limit in LINE OA Manager

const THAI_RANGE = 'U+0E01-0E5B, U+200C-200D, U+25CC';
const LATIN_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

function loadFontDataUri(filename) {
  const buf = fs.readFileSync(path.join(FONTS_DIR, filename));
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}

function buildFontCss() {
  const weights = [400, 500, 600];
  return weights.map((weight) => {
    const thaiUri = loadFontDataUri(`IBMPlexSansThai-${weight}-thai.woff2`);
    const latinUri = loadFontDataUri(`IBMPlexSansThai-${weight}-latin.woff2`);
    return `
      @font-face {
        font-family: 'IBM Plex Sans Thai';
        font-style: normal;
        font-weight: ${weight};
        font-display: block;
        src: url('${thaiUri}') format('woff2');
        unicode-range: ${THAI_RANGE};
      }
      @font-face {
        font-family: 'IBM Plex Sans Thai';
        font-style: normal;
        font-weight: ${weight};
        font-display: block;
        src: url('${latinUri}') format('woff2');
        unicode-range: ${LATIN_RANGE};
      }
    `;
  }).join('\n');
}

// Exact PakMaii Two-Leaves brand logo adapted from public/js/core/graphics.js
const TWO_LEAVES_LOGO_SVG = `
  <svg viewBox="0 0 36 36" width="38" height="38" fill="none" aria-hidden="true">
    <path d="M6 28C6 16 14 6 24 4C24 16 16 26 6 28Z" fill="#15803D"/>
    <path d="M8 26C12 21 16 15 20 8" stroke="#DCFCE7" stroke-width="2" stroke-linecap="round"/>
    <path d="M17 28C17 18 23 10 32 8C32 18 26 26 17 28Z" fill="#22C55E"/>
    <path d="M19 26C22 22 25 17 29 12" stroke="#DCFCE7" stroke-width="1.8" stroke-linecap="round"/>
  </svg>
`;

const ICONS_SVG = {
  // Cell A: Farmland Plot & Map Pin
  plots: `
    <svg viewBox="0 0 128 128" width="144" height="144" fill="none" aria-hidden="true">
      <path d="M64 18C44.118 18 28 34.118 28 54C28 78 64 110 64 110C64 110 100 78 100 54C100 34.118 83.882 18 64 18Z" fill="#CFE9D8" stroke="#173D2C" stroke-width="6.5" stroke-linejoin="round"/>
      <circle cx="64" cy="54" r="22" fill="#FFFFFF" stroke="#173D2C" stroke-width="5"/>
      <path d="M64 64V44" stroke="#15803D" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M64 48C64 40 70 36 76 36C76 44 70 48 64 48Z" fill="#22C55E" stroke="#173D2C" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M64 52C64 45 58 42 52 42C52 49 58 52 64 52Z" fill="#4ADE80" stroke="#173D2C" stroke-width="3.5" stroke-linejoin="round"/>
    </svg>
  `,
  // Cell B (Hero): Field Logbook + Pencil + Leaf
  record: `
    <svg viewBox="0 0 128 128" width="144" height="144" fill="none" aria-hidden="true">
      <rect x="22" y="18" width="74" height="92" rx="12" fill="#E8F4ED" stroke="#173D2C" stroke-width="6.5"/>
      <path d="M36 18V110" stroke="#173D2C" stroke-width="5.5"/>
      <path d="M48 42H78" stroke="#245C43" stroke-width="6" stroke-linecap="round"/>
      <path d="M48 60H74" stroke="#245C43" stroke-width="6" stroke-linecap="round"/>
      <path d="M48 78H64" stroke="#245C43" stroke-width="6" stroke-linecap="round"/>
      <path d="M74 96L107 63C110.5 59.5 110.5 53.5 107 50C103.5 46.5 97.5 46.5 94 50L61 83L58 100L74 96Z" fill="#22C55E" stroke="#173D2C" stroke-width="5.5" stroke-linejoin="round"/>
      <path d="M88 56L101 69" stroke="#173D2C" stroke-width="5"/>
      <circle cx="88" cy="34" r="10" fill="#22C55E" stroke="#173D2C" stroke-width="4.5"/>
    </svg>
  `,
  // Cell C: Organic Fertilizer Bag + Check/Leaf
  approval: `
    <svg viewBox="0 0 128 128" width="144" height="144" fill="none" aria-hidden="true">
      <path d="M44 20H84L76 38H52L44 20Z" fill="#FDE6B0" stroke="#8A5A12" stroke-width="6" stroke-linejoin="round"/>
      <path d="M34 42C34 38 38 35 44 35H84C90 35 94 38 94 42L102 98C103.5 106 98 112 90 112H38C30 112 24.5 106 26 98L34 42Z" fill="#FEF5E1" stroke="#8A5A12" stroke-width="6.5" stroke-linejoin="round"/>
      <path d="M64 88V58" stroke="#245C43" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M64 68C64 56 74 48 85 48C85 60 75 68 64 68Z" fill="#22C55E" stroke="#173D2C" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M64 74C64 62 54 54 43 54C43 66 53 74 64 74Z" fill="#4ADE80" stroke="#173D2C" stroke-width="4.5" stroke-linejoin="round"/>
      <circle cx="98" cy="94" r="20" fill="#245C43" stroke="#FFFFFF" stroke-width="5"/>
      <path d="M89 94L95.5 100.5L108 87" stroke="#FFFFFF" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
  // Cell D: Inspection Review / Standards Badge
  reviews: `
    <svg viewBox="0 0 128 128" width="144" height="144" fill="none" aria-hidden="true">
      <path d="M64 18L24 34V66C24 90 42 108 64 114C86 108 104 90 104 66V34L64 18Z" fill="#E8F4ED" stroke="#173D2C" stroke-width="6.5" stroke-linejoin="round"/>
      <circle cx="64" cy="62" r="24" fill="#FFFFFF" stroke="#22C55E" stroke-width="5"/>
      <path d="M52 62L60 70L76 54" stroke="#173D2C" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M48 88L40 106L56 100L64 106L64 88" fill="#15803D" stroke="#173D2C" stroke-width="4" stroke-linejoin="round"/>
      <path d="M80 88L88 106L72 100L64 106L64 88" fill="#22C55E" stroke="#173D2C" stroke-width="4" stroke-linejoin="round"/>
    </svg>
  `,
  // Cell E: Lot Crop Box & Story Passport
  lots: `
    <svg viewBox="0 0 128 128" width="144" height="144" fill="none" aria-hidden="true">
      <path d="M22 46L64 24L106 46L64 68L22 46Z" fill="#FDE6B0" stroke="#8A5A12" stroke-width="6" stroke-linejoin="round"/>
      <path d="M22 46V84L64 106V68L22 46Z" fill="#F6D28B" stroke="#8A5A12" stroke-width="6" stroke-linejoin="round"/>
      <path d="M106 46V84L64 106V68L106 46Z" fill="#E8BF6D" stroke="#8A5A12" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="94" cy="94" r="22" fill="#FFFFFF" stroke="#173D2C" stroke-width="5"/>
      <rect x="84" y="84" width="20" height="20" rx="4" fill="#CFE9D8" stroke="#173D2C" stroke-width="3"/>
      <rect x="88" y="88" width="4" height="4" fill="#15803D"/>
      <rect x="96" y="88" width="4" height="4" fill="#15803D"/>
      <rect x="88" y="96" width="4" height="4" fill="#15803D"/>
      <rect x="96" y="96" width="4" height="4" fill="#15803D"/>
    </svg>
  `,
  // Cell F: Contact ICS Officer
  ics: `
    <svg viewBox="0 0 128 128" width="144" height="144" fill="none" aria-hidden="true">
      <path d="M24 62C24 39.909 41.909 22 64 22C86.091 22 104 39.909 104 62" stroke="#146356" stroke-width="7.5" stroke-linecap="round"/>
      <rect x="16" y="56" width="18" height="30" rx="9" fill="#BCE3DA" stroke="#146356" stroke-width="6"/>
      <rect x="94" y="56" width="18" height="30" rx="9" fill="#BCE3DA" stroke="#146356" stroke-width="6"/>
      <path d="M102 86V94C102 101.732 95.732 108 88 108H70" stroke="#146356" stroke-width="6" stroke-linecap="round"/>
      <rect x="52" y="100" width="22" height="14" rx="7" fill="#2E9B87" stroke="#146356" stroke-width="5"/>
      <path d="M40 50C40 43.373 45.373 38 52 38H76C82.627 38 88 43.373 88 50V68C88 74.627 82.627 80 76 80H62L48 90V80H52C45.373 80 40 74.627 40 68V50Z" fill="#FFFFFF" stroke="#146356" stroke-width="5.5" stroke-linejoin="round"/>
      <circle cx="55" cy="59" r="3.5" fill="#2E9B87"/>
      <circle cx="64" cy="59" r="3.5" fill="#2E9B87"/>
      <circle cx="73" cy="59" r="3.5" fill="#2E9B87"/>
    </svg>
  `
};

const HERO_WATERMARK_LEAF_SVG = `
  <svg viewBox="0 0 220 220" width="240" height="240" fill="none" aria-hidden="true">
    <path d="M30 190C30 100 95 30 190 18C190 110 125 180 30 190Z" fill="#FFFFFF"/>
    <path d="M44 176C88 134 128 88 164 42" stroke="#1D543A" stroke-width="8" stroke-linecap="round"/>
  </svg>
`;

function buildRichMenuHtml() {
  const fontCss = buildFontCss();
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8">
<style>
  ${fontCss}
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  html, body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background: #E9F0EA;
    font-family: 'IBM Plex Sans Thai', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .canvas {
    position: relative;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    display: grid;
    grid-template-columns: 833px 834px 833px;
    grid-template-rows: 843px 843px;
    background: #E9F0EA;
  }
  .top-accent {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 12px;
    background: #173D2C;
    z-index: 10;
  }
  .cell {
    display: flex;
    align-items: stretch;
    justify-content: stretch;
  }
  /* Exact 32px inner gaps & 28px outer margin inside each 833/834 x 843 touch block */
  .cell-a { padding: 30px 16px 16px 28px; }
  .cell-b { padding: 30px 16px 16px 16px; }
  .cell-c { padding: 30px 28px 16px 16px; }
  .cell-d { padding: 16px 16px 28px 28px; }
  .cell-e { padding: 16px 16px 28px 16px; }
  .cell-f { padding: 16px 28px 28px 16px; }

  .card {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 44px;
    background: #FFFFFF;
    border: 3px solid #D0DFD3;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 28px 28px;
    overflow: hidden;
    text-align: center;
  }
  .row-1 .card {
    padding-top: 72px;
  }
  .card-hero {
    background: #1D543A;
    border: 4px solid #143B28;
  }
  .brand-pill {
    position: absolute;
    top: 26px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: #F3F8F4;
    border: 2px solid #D3E4D7;
    border-radius: 999px;
    padding: 7px 24px 7px 16px;
    font-size: 34px;
    font-weight: 600;
    color: #173D2C;
    line-height: 1.1;
  }
  .hero-pill {
    position: absolute;
    top: 26px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.18);
    border: 2px solid rgba(255, 255, 255, 0.28);
    border-radius: 999px;
    padding: 8px 34px;
    font-size: 36px;
    font-weight: 600;
    color: #ECFDF5;
    line-height: 1.1;
  }
  .hero-watermark {
    position: absolute;
    right: -18px;
    bottom: -18px;
    opacity: 0.09;
    pointer-events: none;
  }
  .icon-box {
    width: 244px;
    height: 244px;
    border-radius: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 30px;
    flex-shrink: 0;
  }
  .icon-plots    { background: #E8F4ED; border: 3px solid #C5E2CE; }
  .icon-hero     { background: #FFFFFF; border: 3px solid #D1FAE5; }
  .icon-approval { background: #FEF5E1; border: 3px solid #F5DBA3; }
  .icon-reviews  { background: #EBF3ED; border: 3px solid #C8DFD1; }
  .icon-lots     { background: #FEF6E5; border: 3px solid #F7DDAA; }
  .icon-ics      { background: #E4F4F1; border: 3px solid #BAE0D8; }

  .title {
    font-size: 92px;
    font-weight: 600;
    line-height: 1.18;
    color: #173D2C;
    margin-bottom: 16px;
    letter-spacing: -0.01em;
  }
  .card-hero .title {
    font-size: 96px;
    color: #FFFFFF;
  }
  .subtitle {
    font-size: 52px;
    font-weight: 500;
    line-height: 1.25;
    color: #4F6357;
  }
  .card-hero .subtitle {
    color: #D1FAE5;
  }
</style>
</head>
<body>
  <div class="canvas">
    <div class="top-accent"></div>

    <!-- Row 1 -->
    <div class="cell cell-a row-1">
      <div class="card">
        <div class="brand-pill">${TWO_LEAVES_LOGO_SVG}<span>PakMaii ผักไหม</span></div>
        <div class="icon-box icon-plots">${ICONS_SVG.plots}</div>
        <div class="title">แปลงปลูก</div>
        <div class="subtitle">ข้อมูลแปลง & สถานะ</div>
      </div>
    </div>

    <div class="cell cell-b row-1">
      <div class="card card-hero">
        <div class="hero-pill">ใช้บ่อย • บันทึกเร็ว</div>
        <div class="hero-watermark">${HERO_WATERMARK_LEAF_SVG}</div>
        <div class="icon-box icon-hero">${ICONS_SVG.record}</div>
        <div class="title">บันทึกแปลง</div>
        <div class="subtitle">บันทึกงานประจำวัน</div>
      </div>
    </div>

    <div class="cell cell-c row-1">
      <div class="card">
        <div class="icon-box icon-approval">${ICONS_SVG.approval}</div>
        <div class="title">ขอใช้ปัจจัย</div>
        <div class="subtitle">ปุ๋ยและสารชีวภาพ</div>
      </div>
    </div>

    <!-- Row 2 -->
    <div class="cell cell-d">
      <div class="card">
        <div class="icon-box icon-reviews">${ICONS_SVG.reviews}</div>
        <div class="title">ผลตรวจแปลง</div>
        <div class="subtitle">มาตรฐาน PGS & CAPA</div>
      </div>
    </div>

    <div class="cell cell-e">
      <div class="card">
        <div class="icon-box icon-lots">${ICONS_SVG.lots}</div>
        <div class="title">ล็อตผลผลิต</div>
        <div class="subtitle">รหัสล็อต & พาสปอร์ต</div>
      </div>
    </div>

    <div class="cell cell-f">
      <div class="card">
        <div class="icon-box icon-ics">${ICONS_SVG.ics}</div>
        <div class="title">ติดต่อ ICS</div>
        <div class="subtitle">ปรึกษาเจ้าหน้าที่ดูแล</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const html = buildRichMenuHtml();

  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1
    });

    await page.setContent(html, { waitUntil: 'load' });
    const fontCheck = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        status: document.fonts.status,
        hasThaiFont: document.fonts.check('600 92px "IBM Plex Sans Thai"')
      };
    });

    assert.equal(fontCheck.hasThaiFont, true, 'IBM Plex Sans Thai font must be loaded');

    await page.screenshot({ path: PNG_PATH, type: 'png' });
    await page.screenshot({ path: JPG_PATH, type: 'jpeg', quality: 92 });

    // Read PNG IHDR chunk (bytes 16..24 contain width and height in big-endian uint32)
    const pngBuf = fs.readFileSync(PNG_PATH);
    const pngWidth = pngBuf.readUInt32BE(16);
    const pngHeight = pngBuf.readUInt32BE(20);
    assert.equal(pngWidth, WIDTH, `PNG width must be ${WIDTH}`);
    assert.equal(pngHeight, HEIGHT, `PNG height must be ${HEIGHT}`);

    const pngBytes = pngBuf.length;
    const jpgBytes = fs.statSync(JPG_PATH).size;

    assert.ok(pngBytes < MAX_LINE_BYTES, `PNG exceeds 1 MB limit: ${pngBytes} bytes`);
    assert.ok(jpgBytes < MAX_LINE_BYTES, `JPG exceeds 1 MB limit: ${jpgBytes} bytes`);

    console.log(JSON.stringify({
      ok: true,
      dimensions: `${pngWidth}x${pngHeight}`,
      fontLoaded: fontCheck.hasThaiFont,
      outputs: {
        png: { path: PNG_PATH, bytes: pngBytes, kb: Number((pngBytes / 1024).toFixed(2)) },
        jpg: { path: JPG_PATH, bytes: jpgBytes, kb: Number((jpgBytes / 1024).toFixed(2)) }
      }
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
