import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import enMessages from '../messages/en.json';
import hiMessages from '../messages/hi.json';

describe('Phase 4A Block C: i18n & Devanagari Codebase Audit', () => {
  const srcDir = path.resolve(__dirname, '..');

  function getAllSourceFiles(dir: string): string[] {
    const results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...getAllSourceFiles(fullPath));
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  // Documented intentional exceptions:
  // 1. LanguagePickerOverlay.tsx: The first-visit language selection dialog intentionally shows both English and Devanagari (उस्ताद जी, अपनी भाषा चुनें, हिन्दी) so monolingual Hindi speakers can identify their language.
  const ALLOWED_EXCEPTIONS = [
    path.normalize('src/components/ui/LanguagePickerOverlay.tsx'),
  ];

  it('C.1: No Devanagari characters ([\\u0900-\\u097F]) in source code outside allowed files and tests', () => {
    const allFiles = getAllSourceFiles(srcDir);
    const violations: { file: string; line: number; text: string }[] = [];
    const devanagariRegex = /[\u0900-\u097F]/;

    for (const filePath of allFiles) {
      const relativePath = path.normalize(path.relative(path.resolve(srcDir, '..'), filePath));

      // Skip test files
      if (relativePath.startsWith(path.normalize('src/tests/'))) {
        continue;
      }

      // Check against allowed exceptions
      if (ALLOWED_EXCEPTIONS.some((exc) => relativePath.endsWith(exc))) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (devanagariRegex.test(line)) {
          violations.push({
            file: relativePath,
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }

    expect(
      violations,
      `Found hardcoded Devanagari characters in UI/source code:\n${violations
        .map((v) => `  ${v.file}:${v.line} -> ${v.text}`)
        .join('\n')}`
    ).toEqual([]);
  });

  describe('C.4: Message Count & Dictionary Parity', () => {
    function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          Object.assign(result, flattenKeys(value as Record<string, unknown>, fullKey));
        } else {
          result[fullKey] = String(value);
        }
      }
      return result;
    }

    const enFlat = flattenKeys(enMessages as Record<string, unknown>);
    const hiFlat = flattenKeys(hiMessages as Record<string, unknown>);

    it('en.json and hi.json have identical keys and non-zero counts', () => {
      const enKeys = Object.keys(enFlat).sort();
      const hiKeys = Object.keys(hiFlat).sort();

      const missingInHi = enKeys.filter((k) => !(k in hiFlat));
      const missingInEn = hiKeys.filter((k) => !(k in enFlat));

      expect(missingInHi, `Keys in en.json missing in hi.json: ${missingInHi.join(', ')}`).toEqual([]);
      expect(missingInEn, `Keys in hi.json missing in en.json: ${missingInEn.join(', ')}`).toEqual([]);
      expect(enKeys.length).toBe(hiKeys.length);
      expect(enKeys.length).toBeGreaterThan(150);
    });

    it('All placeholders match between en.json and hi.json', () => {
      const extractPlaceholders = (str: string): string[] => {
        const matches = str.match(/\{[a-zA-Z0-9_]+\}/g) || [];
        return matches.sort();
      };

      for (const key of Object.keys(enFlat)) {
        const enPlaceholders = extractPlaceholders(enFlat[key]);
        const hiPlaceholders = extractPlaceholders(hiFlat[key]);
        expect(
          hiPlaceholders,
          `Placeholder mismatch in key "${key}": en=${JSON.stringify(enPlaceholders)}, hi=${JSON.stringify(hiPlaceholders)}`
        ).toEqual(enPlaceholders);
      }
    });
  });
});
