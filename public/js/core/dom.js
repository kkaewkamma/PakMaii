'use strict';

import { icon } from './icons.js';
import { $ } from './state.js';

export function parseLocalIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = typeof value === 'string' && value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return null;
}

export function formatLocalIsoDate(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

export function statusBadge(tier, text, customIcon) {
  const normalized = tier === 'risk' ? 'risk' : tier === 'warn' || tier === 'warning' ? 'warning' : 'normal';
  const iconName = customIcon || (normalized === 'risk' ? 'alert' : normalized === 'warning' ? 'clock' : 'checkCircle');
  return el('span', { className: `badge-${normalized}` }, icon(iconName, 12), ' ', text);
}

export function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'className') node.className = value;
    else if (name.startsWith('on') && typeof value === 'function') node.addEventListener(name.slice(2), value);
    else if (value === true) node.setAttribute(name, '');
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(name, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function notify(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = String(message);
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); }, 4000);
}

export function inputField(name, label, type = 'text', required = true, value = '') {
  return el('label', {}, label, el('input', { name, type, required, value, maxlength: type === 'text' ? 200 : null }));
}

export function selectField(name, label, choices) {
  return el('label', {}, label, el('select', { name, required: true }, choices.map(choice => el('option', { value: choice.value }, choice.label))));
}

export function card(...children) {
  return el('div', { className: 'card' }, children);
}

export function empty(message = 'ยังไม่มีข้อมูล', actionLabel = '', onAction = null) {
  return card(el('div', { className: 'empty-box' },
    el('div', { className: 'empty-icon-wrap' }, icon('leaf', 24)),
    el('p', { className: 'empty-text' }, message),
    actionLabel && typeof onAction === 'function'
      ? el('button', { type: 'button', className: 'secondary btn-sm', onclick: onAction }, actionLabel)
      : null
  ));
}

export function dated(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('th-TH');
}
