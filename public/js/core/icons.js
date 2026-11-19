'use strict';

// SVG Icon definition dictionary (24x24 viewBox, stroke-based)
export const ICONS = {
  sprout: [
    { type: 'path', d: 'M7 20h10' },
    { type: 'path', d: 'M12 20v-8' },
    { type: 'path', d: 'M12 12c0-3 2.5-5.5 5.5-5.5.5 0 1 .05 1.5.15C19 9.5 16.5 12 12 12z' },
    { type: 'path', d: 'M12 15c0-3-2.5-5.5-5.5-5.5-.5 0-1 .05-1.5.15C5 12.5 7.5 15 12 15z' },
  ],
  leaf: [
    { type: 'path', d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 1 9.2A7 7 0 0 1 11 20z' },
    { type: 'path', d: 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12' },
  ],
  clipboard: [
    { type: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' },
    { type: 'path', d: 'M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z' },
    { type: 'path', d: 'M9 12h6' },
    { type: 'path', d: 'M9 16h6' },
  ],
  check: [
    { type: 'path', d: 'M20 6L9 17l-5-5' },
  ],
  checkCircle: [
    { type: 'path', d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' },
    { type: 'path', d: 'M22 4L12 14.01l-3-3' },
  ],
  x: [
    { type: 'path', d: 'M18 6L6 18' },
    { type: 'path', d: 'M6 6l12 12' },
  ],
  xCircle: [
    { type: 'circle', cx: '12', cy: '12', r: '10' },
    { type: 'path', d: 'M15 9l-6 6' },
    { type: 'path', d: 'M9 9l6 6' },
  ],
  clock: [
    { type: 'circle', cx: '12', cy: '12', r: '10' },
    { type: 'path', d: 'M12 6v6l4 2' },
  ],
  alert: [
    { type: 'path', d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' },
    { type: 'line', x1: '12', y1: '9', x2: '12', y2: '13' },
    { type: 'line', x1: '12', y1: '17', x2: '12.01', y2: '17' },
  ],
  edit: [
    { type: 'path', d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' },
    { type: 'path', d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' },
  ],
  plus: [
    { type: 'line', x1: '12', y1: '5', x2: '12', y2: '19' },
    { type: 'line', x1: '5', y1: '12', x2: '19', y2: '12' },
  ],
  search: [
    { type: 'circle', cx: '11', cy: '11', r: '8' },
    { type: 'line', x1: '21', y1: '21', x2: '16.65', y2: '16.65' },
  ],
  refresh: [
    { type: 'path', d: 'M23 4v6h-6' },
    { type: 'path', d: 'M1 20v-6h6' },
    { type: 'path', d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' },
  ],
  package: [
    { type: 'path', d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
    { type: 'path', d: 'M3.27 6.96L12 12.01l8.73-5.05' },
    { type: 'line', x1: '12', y1: '22.08', x2: '12', y2: '12' },
  ],
  calendar: [
    { type: 'rect', x: '3', y: '4', width: '18', height: '18', rx: '2', ry: '2' },
    { type: 'line', x1: '16', y1: '2', x2: '16', y2: '6' },
    { type: 'line', x1: '8', y1: '2', x2: '8', y2: '6' },
    { type: 'line', x1: '3', y1: '10', x2: '21', y2: '10' },
  ],
  user: [
    { type: 'path', d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' },
    { type: 'circle', cx: '12', cy: '7', r: '4' },
  ],
  users: [
    { type: 'path', d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { type: 'circle', cx: '9', cy: '7', r: '4' },
    { type: 'path', d: 'M23 21v-2a4 4 0 0 0-3-3.87' },
    { type: 'path', d: 'M16 3.13a4 4 0 0 1 0 7.75' },
  ],
  mapPin: [
    { type: 'path', d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' },
    { type: 'circle', cx: '12', cy: '10', r: '3' },
  ],
  message: [
    { type: 'path', d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  ],
  shield: [
    { type: 'path', d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
    { type: 'path', d: 'M9 12l2 2 4-4' },
  ],
  camera: [
    { type: 'path', d: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z' },
    { type: 'circle', cx: '12', cy: '13', r: '4' },
  ],
  logOut: [
    { type: 'path', d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' },
    { type: 'path', d: 'M16 17l5-5-5-5' },
    { type: 'line', x1: '21', y1: '12', x2: '9', y2: '12' },
  ],
  logIn: [
    { type: 'path', d: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' },
    { type: 'path', d: 'M10 17l5-5-5-5' },
    { type: 'line', x1: '15', y1: '12', x2: '3', y2: '12' },
  ],
  info: [
    { type: 'circle', cx: '12', cy: '12', r: '10' },
    { type: 'line', x1: '12', y1: '16', x2: '12', y2: '12' },
    { type: 'line', x1: '12', y1: '8', x2: '12.01', y2: '8' },
  ],
  mic: [
    { type: 'path', d: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' },
    { type: 'path', d: 'M19 10v2a7 7 0 0 1-14 0v-2' },
    { type: 'line', x1: '12', y1: '19', x2: '12', y2: '23' },
    { type: 'line', x1: '8', y1: '23', x2: '16', y2: '23' }
  ],
  printer: [
    { type: 'path', d: 'M6 9V2h12v7' },
    { type: 'path', d: 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2' },
    { type: 'path', d: 'M6 14h12v8H6z' }
  ],
  fileText: [
    { type: 'path', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    { type: 'path', d: 'M14 2v6h6' },
    { type: 'line', x1: '16', y1: '13', x2: '8', y2: '13' },
    { type: 'line', x1: '16', y1: '17', x2: '8', y2: '17' },
    { type: 'line', x1: '10', y1: '9', x2: '8', y2: '9' }
  ],
  moreHorizontal: [
    { type: 'circle', cx: '12', cy: '12', r: '1.5' },
    { type: 'circle', cx: '19', cy: '12', r: '1.5' },
    { type: 'circle', cx: '5', cy: '12', r: '1.5' }
  ]
};

// Safe pure DOM SVG icon builder — no innerHTML
export function icon(name, size = 16, className = 'ui-icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);

  const shapes = ICONS[name] || ICONS.sprout;
  for (const item of shapes) {
    const elNode = document.createElementNS('http://www.w3.org/2000/svg', item.type || 'path');
    for (const [attr, val] of Object.entries(item)) {
      if (attr !== 'type') elNode.setAttribute(attr, val);
    }
    svg.appendChild(elNode);
  }
  return svg;
}
