#!/usr/bin/env node
// Checks a crucible items document against the rules in schema/crucible.schema.json, with no
// dependencies. Reads .json files, or .js files that set window.CRUCIBLE / window.CRUCIBLE_SAMPLE.
//
//   node scripts/validate.mjs items.json [more files...]
//
// Exits 1 and lists every problem when a file is invalid. Never prints item contents.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { pathToFileURL } from 'node:url';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HTTP = /^https?:\/\//;
const TOP = new Set(['version', 'title', 'brand', 'goal', 'snapshot', 'linkBase', 'quadrants', 'items']);
const ITEM = new Set(['id', 'q', 'title', 'by', 'deadline', 'next', 'description', 'key', 'url', 'source']);

const isDate = v => typeof v === 'string' && DATE.test(v) && !Number.isNaN(new Date(v + 'T00:00:00Z').getTime());
const isWhen = v => isDate(v) || Number.isInteger(v);

/** Returns a list of problems; empty when the document is valid. */
export function validateDoc(doc) {
  const p = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['the document must be an object'];
  for (const k of Object.keys(doc)) if (!TOP.has(k)) p.push(`unknown field "${k}"`);
  if (doc.version !== undefined && doc.version !== 1) p.push('version must be 1');
  for (const k of ['title', 'brand']) if (doc[k] !== undefined && typeof doc[k] !== 'string') p.push(`${k} must be text`);
  if (doc.goal !== undefined) {
    const g = doc.goal;
    if (!g || typeof g !== 'object' || typeof g.label !== 'string' || !isWhen(g.date)) p.push('goal needs a label and a date (YYYY-MM-DD or days from today)');
    else for (const k of Object.keys(g)) if (k !== 'label' && k !== 'date') p.push(`goal: unknown field "${k}"`);
  }
  if (doc.snapshot !== undefined && !isDate(doc.snapshot)) p.push('snapshot must be a date, YYYY-MM-DD');
  if (doc.linkBase !== undefined && !(typeof doc.linkBase === 'string' && HTTP.test(doc.linkBase))) p.push('linkBase must start with http:// or https://');
  if (doc.quadrants !== undefined) {
    if (!doc.quadrants || typeof doc.quadrants !== 'object') p.push('quadrants must be an object keyed 1 to 4');
    else for (const [k, v] of Object.entries(doc.quadrants)) {
      if (!['1', '2', '3', '4'].includes(k)) p.push(`quadrants: key "${k}" must be 1, 2, 3 or 4`);
      const ok = (typeof v === 'string' && v) || (v && typeof v === 'object' && Object.keys(v).every(x => (x === 'name' || x === 'hint') && typeof v[x] === 'string' && v[x]));
      if (!ok) p.push(`quadrants.${k} must be a name, or { name, hint }`);
    }
  }
  if (!Array.isArray(doc.items)) p.push('items must be a list');
  else {
    if (doc.items.length > 200) p.push('items: at most 200');
    const ids = new Set();
    doc.items.forEach((it, i) => {
      const at = `items[${i}]`;
      if (!it || typeof it !== 'object' || Array.isArray(it)) { p.push(`${at} must be an object`); return; }
      for (const k of Object.keys(it)) if (!ITEM.has(k)) p.push(`${at}: unknown field "${k}"`);
      if (![1, 2, 3, 4].includes(it.q)) p.push(`${at}.q must be 1, 2, 3 or 4`);
      if (typeof it.title !== 'string' || !it.title.trim()) p.push(`${at}.title is required`);
      if (it.by !== undefined && it.by !== null && !isWhen(it.by)) p.push(`${at}.by must be YYYY-MM-DD, a whole number of days, or null`);
      if (it.deadline !== undefined && !isWhen(it.deadline)) p.push(`${at}.deadline must be YYYY-MM-DD or a whole number of days`);
      for (const k of ['next', 'description', 'key', 'source', 'id']) if (it[k] !== undefined && typeof it[k] !== 'string') p.push(`${at}.${k} must be text`);
      if (typeof it.description === 'string' && it.description.length > 4000) p.push(`${at}.description: at most 4000 characters`);
      if (it.url !== undefined && !(typeof it.url === 'string' && HTTP.test(it.url))) p.push(`${at}.url must start with http:// or https://`);
      if (typeof it.id === 'string') { if (ids.has(it.id)) p.push(`${at}.id "${it.id}" is used twice`); ids.add(it.id); }
    });
  }
  return p;
}

/** Reads a document from a .json file, or a .js file that assigns window.CRUCIBLE or window.CRUCIBLE_SAMPLE. */
export function readDoc(path) {
  const text = readFileSync(path, 'utf8');
  if (!path.endsWith('.js')) return JSON.parse(text);
  const window = {};
  runInNewContext(text, { window }, { timeout: 1000, filename: path });
  return window.CRUCIBLE ?? window.CRUCIBLE_SAMPLE;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Usage: node scripts/validate.mjs <items.json|items.js> [...]'); process.exit(2); }
  let failed = false;
  for (const f of files) {
    let problems;
    try { problems = validateDoc(readDoc(f)); } catch (err) { problems = [`can't read: ${err.message}`]; }
    if (problems.length) { failed = true; console.error(`${f}: invalid\n- ${problems.join('\n- ')}`); }
    else console.log(`${f}: valid`);
  }
  process.exit(failed ? 1 : 0);
}
