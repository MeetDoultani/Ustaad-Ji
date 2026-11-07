import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 4A Block C: JSX Attribute Literals Audit', () => {
  const srcDir = path.resolve(__dirname, '..');

  function getAllTsxFiles(dir: string): string[] {
    const results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'tests' && file !== 'node_modules' && file !== '.next') {
          results.push(...getAllTsxFiles(fullPath));
        }
      } else if (file.endsWith('.tsx')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  // Attributes to audit: placeholder, aria-label, title, alt, aria-description, label
  // Ignored attributes: className, href, id, key, type, name, role, data-*
  const AUDITED_ATTRIBUTES = [
    'placeholder',
    'aria-label',
    'title',
    'alt',
    'aria-description',
    'label',
  ];

  it('ensures no hardcoded literal text in user-visible JSX attributes', () => {
    const files = getAllTsxFiles(srcDir);
    const violations: { file: string; line: number; attr: string; value: string }[] = [];

    // Allowed literals: empty, pure symbols, punctuation, digits, or brand name
    const isAllowedValue = (val: string) => {
      const trimmed = val.trim();
      if (!trimmed) return true;
      if (trimmed === 'Ustaad-Ji' || trimmed === 'Ustaad-Ji Logo') return true;
      // If it contains no alphabet letters, it's just symbols/digits (e.g. "+91", "₹", "•", "✕")
      if (!/[a-zA-Z\u0900-\u097F]/.test(trimmed)) return true;
      return false;
    };

    for (const filePath of files) {
      const relativePath = path.relative(path.resolve(srcDir, '..'), filePath);
      const content = fs.readFileSync(filePath, 'utf-8');

      for (const attr of AUDITED_ATTRIBUTES) {
        // Regex matching attr="...", attr='...', attr={'...'}, attr={... ? '...' : ...}
        const regexes = [
          new RegExp(`\\b${attr}\\s*=\\s*"([^"]+)"`, 'g'),
          new RegExp(`\\b${attr}\\s*=\\s*'([^']+)'`, 'g'),
          new RegExp(`\\b${attr}\\s*=\\s*\\{\\s*['"]([^'"]+)['"]\\s*\\}`, 'g'),
          new RegExp(`\\b${attr}\\s*=\\s*\\{[^}]*\\?\\s*['"]([^'"]+)['"]\\s*:`, 'g'),
          new RegExp(`\\b${attr}\\s*=\\s*\\{[^}]*:\\s*['"]([^'"]+)['"]\\s*\\}`, 'g'),
        ];

        for (const regex of regexes) {
          let m: RegExpExecArray | null;
          while ((m = regex.exec(content)) !== null) {
            const val = m[1];
            if (!isAllowedValue(val)) {
              const line = content.slice(0, m.index).split('\n').length;
              violations.push({
                file: relativePath,
                line,
                attr,
                value: val,
              });
            }
          }
        }
      }
    }

    // Deduplicate violations by file, line, attr
    const uniqueViolations = violations.filter(
      (v, i, arr) => arr.findIndex((x) => x.file === v.file && x.line === v.line && x.attr === v.attr) === i
    );

    if (uniqueViolations.length > 0) {
      console.error('JSX Attribute Violations Found:\n', JSON.stringify(uniqueViolations, null, 2));
    }

    expect(uniqueViolations).toEqual([]);
  });
});
