'use strict';

// Safe DOM-based SVG graphic generator for PakMaii Reference Design
// Adheres strictly to CSP (no innerHTML, pure SVG DOM nodes)

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, val] of Object.entries(attrs)) {
    el.setAttribute(key, String(val));
  }
  return el;
}

// 1. Two-Leaves Brand Logo (Ready to Grow PakMaii)
export function createTwoLeavesLogo(size = 32) {
  const svg = createSvgElement('svg', {
    viewBox: '0 0 36 36',
    width: size,
    height: size,
    fill: 'none',
    'aria-hidden': 'true'
  });

  // Left leaf (Forest green #15803D)
  const leftLeaf = createSvgElement('path', {
    d: 'M6 28C6 16 14 6 24 4C24 16 16 26 6 28Z',
    fill: '#15803D'
  });
  // Left leaf spine
  const leftSpine = createSvgElement('path', {
    d: 'M8 26C12 21 16 15 20 8',
    stroke: '#DCFCE7',
    'stroke-width': '2',
    'stroke-linecap': 'round'
  });

  // Right leaf (Vibrant emerald #22C55E)
  const rightLeaf = createSvgElement('path', {
    d: 'M17 28C17 18 23 10 32 8C32 18 26 26 17 28Z',
    fill: '#22C55E'
  });
  // Right leaf spine
  const rightSpine = createSvgElement('path', {
    d: 'M19 26C22 22 25 17 29 12',
    stroke: '#DCFCE7',
    'stroke-width': '1.8',
    'stroke-linecap': 'round'
  });

  svg.append(leftLeaf, leftSpine, rightLeaf, rightSpine);
  return svg;
}

// 2. Minimal Banking-App / ThaID User Profile Silhouette Avatar
export function createFarmerAvatarSvg(size = 50) {
  const svg = createSvgElement('svg', {
    viewBox: '0 0 64 64',
    width: size,
    height: size,
    fill: 'none',
    'aria-hidden': 'true',
    class: 'farmer-avatar-svg'
  });

  const bg = createSvgElement('circle', {
    cx: '32',
    cy: '32',
    r: '30',
    fill: '#E8F4ED',
    stroke: '#B9DEC8',
    'stroke-width': '2'
  });

  const head = createSvgElement('circle', {
    cx: '32',
    cy: '24.5',
    r: '9.5',
    fill: '#1D5B3F'
  });

  const shoulders = createSvgElement('path', {
    d: 'M 13 53.91 C 14.5 44 22 38.5 32 38.5 C 42 38.5 49.5 44 51 53.91 A 29 29 0 0 1 13 53.91 Z',
    fill: '#1D5B3F'
  });

  svg.append(bg, head, shoulders);
  return svg;
}

// 3. My Plots Landscape Thumbnail (Lush green tea / rice terrace rows)
export function createPlotLandscapeSvg(width = 120, height = 74) {
  const svg = createSvgElement('svg', {
    viewBox: '0 0 160 100',
    width: width,
    height: height,
    fill: 'none',
    'aria-hidden': 'true',
    class: 'plots-landscape-svg'
  });

  // Sky
  const sky = createSvgElement('rect', {
    width: '160',
    height: '100',
    rx: '12',
    fill: '#E0F2FE'
  });

  // Sun
  const sun = createSvgElement('circle', {
    cx: '135',
    cy: '24',
    r: '14',
    fill: '#FEF08A'
  });

  // Distant mountains
  const mountainFar = createSvgElement('path', {
    d: 'M0 65C30 45 70 50 110 38C135 30 150 42 160 50L160 100L0 100Z',
    fill: '#86EFAC'
  });

  // Middle rolling terrace hills (#16A34A)
  const hillsMid = createSvgElement('path', {
    d: 'M0 75C40 60 80 75 120 58C140 50 155 58 160 65L160 100L0 100Z',
    fill: '#16A34A'
  });

  // Front crop rows (#15803D)
  const cropsFront = createSvgElement('path', {
    d: 'M0 86C35 76 75 88 120 74C145 68 155 72 160 78L160 100L0 100Z',
    fill: '#15803D'
  });

  // Terrace row lines
  const row1 = createSvgElement('path', {
    d: 'M10 82C40 75 75 82 110 71',
    stroke: '#4ADE80',
    'stroke-width': '2',
    'stroke-linecap': 'round'
  });
  const row2 = createSvgElement('path', {
    d: 'M5 92C45 84 85 93 130 80',
    stroke: '#22C55E',
    'stroke-width': '2.5',
    'stroke-linecap': 'round'
  });

  svg.append(sky, sun, mountainFar, hillsMid, cropsFront, row1, row2);
  return svg;
}

// 4. Fresh Organic Lettuce / Crop Thumbnail (Square 48x48)
export function createCropThumbnailSvg(size = 48) {
  const svg = createSvgElement('svg', {
    viewBox: '0 0 54 54',
    width: size,
    height: size,
    fill: 'none',
    'aria-hidden': 'true',
    class: 'crop-thumbnail-svg'
  });

  // Background container
  const bg = createSvgElement('rect', {
    width: '54',
    height: '54',
    rx: '12',
    fill: '#F0FDF4',
    stroke: '#DCFCE7',
    'stroke-width': '1.5'
  });

  // Outer leaves (#15803D)
  const leaf1 = createSvgElement('path', {
    d: 'M10 36C8 24 16 16 27 16C38 16 46 24 44 36C40 44 14 44 10 36Z',
    fill: '#16A34A'
  });

  // Middle leaves (#22C55E)
  const leaf2 = createSvgElement('path', {
    d: 'M14 34C14 24 20 18 27 18C34 18 40 24 40 34C36 41 18 41 14 34Z',
    fill: '#22C55E'
  });

  // Center crisp heart leaves (#86EFAC)
  const leaf3 = createSvgElement('path', {
    d: 'M20 32C20 25 23 21 27 21C31 21 34 25 34 32C32 37 22 37 20 32Z',
    fill: '#86EFAC'
  });

  // Leaf ribs (#DCFCE7)
  const rib = createSvgElement('path', {
    d: 'M27 38V24',
    stroke: '#FFFFFF',
    'stroke-width': '2',
    'stroke-linecap': 'round'
  });

  svg.append(bg, leaf1, leaf2, leaf3, rib);
  return svg;
}
