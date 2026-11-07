import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 4A Block C: Old Names & Terminology Audit', () => {
  const rootDir = path.resolve(__dirname, '../..');

  function getAllProjectTextFiles(dir: string): string[] {
    const results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      if (
        file === 'node_modules' ||
        file === '.next' ||
        file === '.git' ||
        file === 'test-output.txt' ||
        file.endsWith('.log') ||
        file.endsWith('.png') ||
        file.endsWith('.jpg') ||
        file.endsWith('.ico') ||
        file.endsWith('.woff2')
      ) {
        continue;
      }

      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...getAllProjectTextFiles(fullPath));
      } else {
        results.push(fullPath);
      }
    }
    return results;
  }

  // Forbidden terms with Unicode escapes for Devanagari
  const FORBIDDEN_PATTERNS: { name: string; regex: RegExp }[] = [
    { name: 'Desi (Devanagari)', regex: /\u0926\u0947\u0938\u0940/i },
    { name: 'Guaranteed (Devanagari)', regex: /\u0917\u093e\u0930\u0902\u091f\u0940\u0921/i },
    { name: 'Phase 4 (Devanagari)', regex: /\u091a\u0930\u0923 4/i },
    { name: 'Indian Salon', regex: /Indian\s+Salon/i },
    { name: 'Indian-salon (non-path)', regex: /Indian-salon(?!-booking)/i },
    { name: 'Dekhein', regex: /\bDekhein\b/i },
    { name: 'Pakka', regex: /\bPakka\b/i },
    { name: 'Aapka', regex: /\bAapka\b/i },
    { name: 'Hinglish', regex: /\bHinglish\b/i },
    { name: 'Guaranteed', regex: /\bGuaranteed\b/i },
    { name: 'Phase 4', regex: /\bPhase\s*4\b/i },
  ];

  // Documented allowed exceptions with specific reasons
  const ALLOWED_EXCEPTION_FILES: Record<string, string> = {
    'docs/decisions.md': 'Historical architecture decision record and terminology change audit log.',
    'docs/phase4a-prompt.md': 'Historical user prompt specification.',
    'docs/phase4a-followup-prompt.md': 'Historical user follow-up prompt specification.',
    'docs/phase4a-fix2-prompt.md': 'Current prompt specification document.',
    'docs/project-spec.md': 'Historical project specification document.',
    'docs/design-brief.md': 'Historical design brief reference document.',
    'docs/i18n-glossary.md': 'Translation reference glossary explicitly documenting forbidden words.',
    'docs/phase2-report.md': 'Historical Phase 2 completion and verification report.',
    'docs/phase3-report.md': 'Historical Phase 3 completion and verification report.',
    'docs/phase3b-report.md': 'Historical Phase 3B completion and verification report.',
    'docs/supabase-migration-report.md': 'Historical Supabase database migration report.',
    'prisma/schema.prisma': 'Rule 2 schema lock prevents modifying top-line file comment.',
    'src/tests/old-names-audit.test.ts': 'Audit test containing pattern definitions and regex strings.',
    'src/tests/phase4a-part1.test.ts': 'Negative test assertions testing that obsolete terms are rejected.',
    'src/tests/phase3b-i18n.test.ts': 'Negative test assertions verifying absence of old branding.',
    'src/tests/phase4a-dashboard.test.ts': 'Test suite title referencing Phase 4A implementation.',
    'src/tests/dashboard.test.ts': 'Test suite title referencing Phase 4A implementation.',
  };

  it('scans all repository text files for obsolete terms', () => {
    const allFiles = getAllProjectTextFiles(rootDir);
    const violations: { file: string; line: number; term: string; snippet: string }[] = [];

    for (const filePath of allFiles) {
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');

      // Check if file is an allowed exception
      if (ALLOWED_EXCEPTION_FILES[relPath]) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        // Ignore directory paths in comments or scripts (e.g. D:/Indian-salon-booking)
        const sanitizedLine = line.replace(/[:\\/][a-zA-Z0-9_\-.]*Indian-salon-booking[a-zA-Z0-9_\-.]*/g, '');

        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.regex.test(sanitizedLine)) {
            violations.push({
              file: relPath,
              line: idx + 1,
              term: pattern.name,
              snippet: line.trim().slice(0, 100),
            });
          }
        }
      });
    }

    if (violations.length > 0) {
      console.error('Old Name Violations Found:\n', JSON.stringify(violations, null, 2));
    }

    expect(violations).toEqual([]);
  });
});
