import type { FrontmatterField } from './api/frontmatter-schemas';

export interface FrontmatterApplication {
  value: string;
  caret: number;
}

interface FrontmatterBlock {
  key: string;
  scalar: string;
  start: number;
  end: number;
}

interface FrontmatterDocument {
  opening: string;
  raw: string;
  closingAndBody: string;
  newline: '\n' | '\r\n';
}

const ENTRY_PATTERN = /^([A-Za-z][A-Za-z0-9_-]{0,63}):(?:[ \t]*(.*))?$/;

function lineAt(value: string, start: number) {
  const newlineAt = value.indexOf('\n', start);
  const end = newlineAt === -1 ? value.length : newlineAt + 1;
  const contentEnd =
    newlineAt !== -1 && value[newlineAt - 1] === '\r'
      ? newlineAt - 1
      : newlineAt === -1
        ? value.length
        : newlineAt;
  return { content: value.slice(start, contentEnd), end };
}

function parseDocument(content: string): FrontmatterDocument | null {
  const opening = /^---(\r\n|\n)/.exec(content);
  if (!opening) return null;

  const frontmatterStart = opening[0].length;
  let cursor = frontmatterStart;
  while (cursor < content.length) {
    const line = lineAt(content, cursor);
    if (line.content === '---') {
      return {
        opening: content.slice(0, frontmatterStart),
        raw: content.slice(frontmatterStart, cursor),
        closingAndBody: content.slice(cursor),
        newline: opening[1] as '\n' | '\r\n',
      };
    }
    if (line.end === cursor) break;
    cursor = line.end;
  }
  return null;
}

function parseBlocks(raw: string): FrontmatterBlock[] {
  const starts: Array<Omit<FrontmatterBlock, 'end'>> = [];
  let cursor = 0;
  while (cursor < raw.length) {
    const line = lineAt(raw, cursor);
    const match = ENTRY_PATTERN.exec(line.content);
    if (match) {
      starts.push({
        key: match[1],
        scalar: match[2] ?? '',
        start: cursor,
      });
    }
    if (line.end === cursor) break;
    cursor = line.end;
  }

  return starts.map((block, index) => ({
    ...block,
    end: starts[index + 1]?.start ?? raw.length,
  }));
}

function decodeQuoted(value: string): string | null {
  if (!value.startsWith('"')) return null;
  try {
    const decoded: unknown = JSON.parse(value);
    return typeof decoded === 'string' ? decoded : null;
  } catch {
    return null;
  }
}

function splitInlineList(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const inner = trimmed.slice(1, -1);
  if (!inner.trim()) return [];

  const items: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < inner.length; index += 1) {
    const character = inner[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      items.push(inner.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quoted) return null;
  items.push(inner.slice(start).trim());

  return items.map((item) => decodeQuoted(item) ?? item);
}

function decodeValue(field: FrontmatterField, scalar: string): string {
  const value = scalar.trim();
  if (field.type === 'list') {
    const items = splitInlineList(value);
    return items ? items.join(', ') : value;
  }
  return decodeQuoted(value) ?? value;
}

function valueFor(
  field: FrontmatterField,
  values: Record<string, string>,
): string {
  return Object.prototype.hasOwnProperty.call(values, field.key)
    ? values[field.key]
    : field.defaultValue;
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateValue(field: FrontmatterField, value: string): void {
  const trimmed = value.trim();
  const hasListItem = value.split(',').some((item) => item.trim());
  if (
    field.required &&
    (!trimmed || (field.type === 'list' && !hasListItem))
  ) {
    throw new Error(`${field.label} is required`);
  }
  if (!trimmed) return;

  if (field.type === 'number' && !Number.isFinite(Number(trimmed))) {
    throw new Error(`${field.label} must be a number`);
  }
  if (field.type === 'boolean' && trimmed !== 'true' && trimmed !== 'false') {
    throw new Error(`${field.label} must be true or false`);
  }
  if (field.type === 'date' && !isValidDate(value)) {
    throw new Error(`${field.label} must use YYYY-MM-DD`);
  }
  if (field.type === 'select' && !field.options.includes(value)) {
    throw new Error(`${field.label} has an unsupported value`);
  }
}

function serializeValue(field: FrontmatterField, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return field.type === 'list' ? '[]' : '""';
  if (field.type === 'number') return String(Number(trimmed));
  if (field.type === 'boolean') return trimmed;
  if (field.type === 'list') {
    const items = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return `[${items.map((item) => JSON.stringify(item)).join(', ')}]`;
  }
  return JSON.stringify(value);
}

export function readFrontmatterValues(
  content: string,
  fields: FrontmatterField[],
): Record<string, string> {
  const document = parseDocument(content);
  const blocks = document ? parseBlocks(document.raw) : [];
  const values: Record<string, string> = {};

  for (const field of fields) {
    const block = blocks.findLast((candidate) => candidate.key === field.key);
    const value = block ? decodeValue(field, block.scalar) : field.defaultValue;
    Object.defineProperty(values, field.key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return values;
}

export function applyFrontmatterSchema(
  content: string,
  fields: FrontmatterField[],
  values: Record<string, string>,
): FrontmatterApplication {
  const serialized = new Map<string, string>();
  for (const field of fields) {
    const value = valueFor(field, values);
    validateValue(field, value);
    serialized.set(field.key, `${field.key}: ${serializeValue(field, value)}`);
  }

  const document = parseDocument(content);
  const newline: '\n' | '\r\n' = document
    ? document.newline
    : content.includes('\r\n')
      ? '\r\n'
      : '\n';
  const raw = document?.raw ?? '';
  const blocks = parseBlocks(raw);
  const present = new Set<string>();
  let updated = '';
  let cursor = 0;

  for (const block of blocks) {
    updated += raw.slice(cursor, block.start);
    const replacement = serialized.get(block.key);
    if (replacement !== undefined) {
      updated += replacement + newline;
      present.add(block.key);
    } else {
      updated += raw.slice(block.start, block.end);
    }
    cursor = block.end;
  }
  updated += raw.slice(cursor);

  for (const field of fields) {
    if (present.has(field.key)) continue;
    if (updated && !updated.endsWith('\n')) updated += newline;
    updated += `${serialized.get(field.key)}${newline}`;
  }

  if (document) {
    const value = document.opening + updated + document.closingAndBody;
    return { value, caret: document.opening.length + updated.length };
  }

  const opening = `---${newline}`;
  const value = `${opening}${updated}---${newline}${newline}${content}`;
  return { value, caret: opening.length + updated.length };
}
