import fs from 'fs';
import path from 'path';
import { CaseSchema, type Case } from './schema';

let _cache: Case[] | null = null;

export function loadCases(): Case[] {
  if (_cache) return _cache;

  const casesDir = path.join(process.cwd(), 'cases');
  const files = fs.readdirSync(casesDir).filter(f => f.endsWith('.json'));

  _cache = files.map(file => {
    const raw = JSON.parse(fs.readFileSync(path.join(casesDir, file), 'utf-8'));
    const result = CaseSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`Malformed case file ${file}: ${result.error.message}`);
    }
    return result.data;
  });

  return _cache;
}

export function getCaseById(id: string): Case {
  const c = loadCases().find(c => c.id === id);
  if (!c) throw new Error(`Case not found: ${id}`);
  return c;
}
