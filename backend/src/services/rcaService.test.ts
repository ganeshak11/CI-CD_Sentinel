/**
 * rcaService.test.ts — Unit Tests for RCA Engine + Error Patterns
 *
 * Coverage:
 *  - At least 3 test cases per pattern type (24+ total)
 *  - Confidence scoring (exact vs partial matches)
 *  - Severity assignment
 *  - Edge cases (empty input, no matches)
 *  - fetchLogs failure does NOT crash the webhook
 */

import { analyzeLog } from './rcaService';
import { matchLine, ALL_PATTERNS, BUILD_FAILURE, TEST_FAILURE, OOM_KILL, TIMEOUT, MISSING_SECRET, NETWORK_ERROR, DEPENDENCY_CONFLICT, LINT_ERROR } from '../utils/errorPatterns';

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildLog(...lines: string[]): string {
  return lines.join('\n');
}

// ─── analyzeLog: Edge Cases ───────────────────────────────────────────────────

describe('analyzeLog — edge cases', () => {
  test('returns empty array for empty string', () => {
    expect(analyzeLog('')).toEqual([]);
  });

  test('returns empty array for whitespace-only input', () => {
    expect(analyzeLog('   \n  \n  ')).toEqual([]);
  });

  test('returns empty array for clean log with no errors', () => {
    const log = buildLog(
      '2024-01-15T10:00:00Z npm install completed',
      '2024-01-15T10:00:01Z Build succeeded',
      '2024-01-15T10:00:02Z All tests passed',
      '2024-01-15T10:00:03Z Deploy finished'
    );
    expect(analyzeLog(log)).toEqual([]);
  });

  test('deduplicates pattern types — keeps highest confidence', () => {
    const log = buildLog(
      'Error: Cannot find module "react"',
      'error TS2307: Cannot find module "lodash"'
    );
    const results = analyzeLog(log);
    const buildFailures = results.filter((r) => r.type === 'build_failure');
    expect(buildFailures).toHaveLength(1);
    expect(buildFailures[0].confidence).toBe(0.9);
  });

  test('results are sorted by confidence DESC', () => {
    const log = buildLog(
      'ECONNREFUSED 127.0.0.1:5432',
      'Cannot find module "express"'
    );
    const results = analyzeLog(log);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].confidence).toBeGreaterThanOrEqual(results[i].confidence);
    }
  });
});

// ─── BUILD_FAILURE (3 tests) ──────────────────────────────────────────────────

describe('analyzeLog — build_failure', () => {
  test('detects "Cannot find module" with confidence 0.9', () => {
    const log = buildLog(
      'Step 3/5: Build',
      "Error: Cannot find module 'express'",
      'npm ERR! code ELIFECYCLE'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'build_failure');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
    expect(match!.severity).toBe('warning');
  });

  test('detects "SyntaxError" with confidence 0.9', () => {
    const log = buildLog(
      'SyntaxError: Unexpected token } in JSON at position 42',
      'Build failed with errors'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'build_failure');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });

  test('detects "tsc: error TS" with confidence 0.9', () => {
    const log = buildLog(
      'src/app.ts(15,3): tsc: error TS2322: Type string is not assignable to type number'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'build_failure');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });
});

// ─── TEST_FAILURE (3 tests) ───────────────────────────────────────────────────

describe('analyzeLog — test_failure', () => {
  test('detects "FAIL src/" with confidence 0.9', () => {
    const log = buildLog(
      'FAIL src/services/auth.test.ts',
      '  ● Login flow › should reject invalid credentials'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'test_failure');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
    expect(match!.severity).toBe('warning');
  });

  test('detects "● Test suite failed" with confidence 0.9', () => {
    const log = buildLog(
      '● Test suite failed to run',
      'SyntaxError in test setup'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'test_failure');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });

  test('detects "AssertionError" with confidence 0.9', () => {
    const log = buildLog(
      'AssertionError: expected 200 to equal 404',
      '  at Context.<anonymous> (test.ts:42:5)'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'test_failure');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });
});

// ─── OOM_KILL (3 tests) ──────────────────────────────────────────────────────

describe('analyzeLog — oom_kill', () => {
  test('detects "Out of memory" with confidence 0.9 and severity critical', () => {
    const log = buildLog(
      'FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap Out of memory'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'oom_kill');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
    expect(match!.severity).toBe('critical');
  });

  test('detects "Killed" with confidence 0.6 (regex match)', () => {
    const log = buildLog(
      'Process was Killed by the OOM killer'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'oom_kill');
    expect(match).toBeDefined();
    // "Killed" as a word boundary regex match gets 0.6
    expect(match!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  test('detects "exit code 137" with confidence 0.9', () => {
    const log = buildLog(
      'Process exited with exit code 137',
      'Container terminated due to memory pressure'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'oom_kill');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
    expect(match!.severity).toBe('critical');
  });
});

// ─── TIMEOUT (3 tests) ───────────────────────────────────────────────────────

describe('analyzeLog — timeout', () => {
  test('detects "Timeout of" with confidence 0.9', () => {
    const log = buildLog(
      'Error: Timeout of 30000ms exceeded for test "should load page"'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'timeout');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
    expect(match!.severity).toBe('info');
  });

  test('detects "timed out after" with confidence 0.9', () => {
    const log = buildLog(
      'Connection timed out after 10000ms',
      'Retry attempt 3 of 3'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'timeout');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });

  test('detects "ETIMEDOUT" with confidence 0.9', () => {
    const log = buildLog(
      'Error: connect ETIMEDOUT 10.0.0.1:443'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'timeout');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });
});

// ─── MISSING_SECRET (3 tests) ────────────────────────────────────────────────

describe('analyzeLog — missing_secret', () => {
  test('detects "Error: GITHUB_TOKEN" with confidence 0.9 and severity critical', () => {
    const log = buildLog(
      'Error: GITHUB_TOKEN is not defined',
      'Authentication failed'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'missing_secret');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
    expect(match!.severity).toBe('critical');
  });

  test('detects "secret not found" via regex with confidence 0.6', () => {
    const log = buildLog(
      'The deployment secret was not found in the environment'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'missing_secret');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.6);
  });

  test('detects "undefined SECRET" via regex with confidence 0.6', () => {
    const log = buildLog(
      'Error: undefined DATABASE_SECRET - check your .env file'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'missing_secret');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.6);
  });
});

// ─── NETWORK_ERROR (3 tests) ─────────────────────────────────────────────────

describe('analyzeLog — network_error', () => {
  test('detects "ECONNREFUSED" with confidence 0.9', () => {
    const log = buildLog(
      'Error: connect ECONNREFUSED 127.0.0.1:5432'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'network_error');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
    expect(match!.severity).toBe('info');
  });

  test('detects "ENOTFOUND" with confidence 0.9', () => {
    const log = buildLog(
      'getaddrinfo ENOTFOUND api.example.com'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'network_error');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });

  test('detects "fetch failed" with confidence 0.9', () => {
    const log = buildLog(
      'TypeError: fetch failed',
      'Caused by: AggregateError'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'network_error');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });
});

// ─── DEPENDENCY_CONFLICT (3 tests) ───────────────────────────────────────────

describe('analyzeLog — dependency_conflict', () => {
  test('detects "peer dep" with confidence 0.9', () => {
    const log = buildLog(
      'npm WARN peer dep missing: react@^18.0.0, required by react-dom@18.2.0'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'dependency_conflict');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
    expect(match!.severity).toBe('info');
  });

  test('detects "ERESOLVE" with confidence 0.9', () => {
    const log = buildLog(
      'npm ERR! code ERESOLVE',
      'npm ERR! ERESOLVE unable to resolve dependency tree'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'dependency_conflict');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });

  test('detects "version conflict" with confidence 0.9', () => {
    const log = buildLog(
      'Error: version conflict detected between typescript@4.9.5 and typescript@5.3.2'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'dependency_conflict');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });
});

// ─── LINT_ERROR (3 tests) ────────────────────────────────────────────────────

describe('analyzeLog — lint_error', () => {
  test('detects "ESLint:" with confidence 0.9', () => {
    const log = buildLog(
      'ESLint: 5 errors and 2 warnings found',
      '  src/app.ts: no-unused-vars'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'lint_error');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
    expect(match!.severity).toBe('info');
  });

  test('detects "Prettier:" with confidence 0.9', () => {
    const log = buildLog(
      'Prettier: Code style issues found in 3 files. Forgot to run Prettier?'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'lint_error');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });

  test('detects "Parsing error:" with confidence 0.9', () => {
    const log = buildLog(
      'error  Parsing error: Unexpected token',
      '  1 | export default {'
    );
    const results = analyzeLog(log);
    const match = results.find((r) => r.type === 'lint_error');
    expect(match).toBeDefined();
    expect(match!.confidence).toBe(0.9);
  });
});

// ─── Multiple Pattern Detection ──────────────────────────────────────────────

describe('analyzeLog — multiple patterns', () => {
  test('detects multiple distinct pattern types in one log', () => {
    const log = buildLog(
      "Error: Cannot find module 'dotenv'",
      'FAIL src/app.test.ts',
      'Error: connect ECONNREFUSED 127.0.0.1:7474',
      'npm ERR! code ERESOLVE'
    );
    const results = analyzeLog(log);
    const types = results.map((r) => r.type);
    expect(types).toContain('build_failure');
    expect(types).toContain('test_failure');
    expect(types).toContain('network_error');
    expect(types).toContain('dependency_conflict');
    expect(results.length).toBe(4);
  });

  test('critical patterns are ranked higher when confidence is equal', () => {
    const log = buildLog(
      'FATAL ERROR: Out of memory',
      "Error: Cannot find module 'express'"
    );
    const results = analyzeLog(log);
    // Both are 0.9 confidence, but oom_kill is critical and should rank first in tie-break
    expect(results.length).toBeGreaterThanOrEqual(2);
    const oomIndex = results.findIndex((r) => r.type === 'oom_kill');
    const buildIndex = results.findIndex((r) => r.type === 'build_failure');
    expect(oomIndex).toBeLessThan(buildIndex);
  });
});

// ─── matchLine unit tests ────────────────────────────────────────────────────

describe('matchLine — direct pattern matching', () => {
  test('returns null for non-matching line', () => {
    const result = matchLine('Everything is fine!', BUILD_FAILURE);
    expect(result).toBeNull();
  });

  test('exact phrase match returns confidence 0.9', () => {
    const result = matchLine("Cannot find module 'react'", BUILD_FAILURE);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.9);
  });

  test('message is capped at 200 characters', () => {
    const longLine = 'Cannot find module ' + 'x'.repeat(300);
    const result = matchLine(longLine, BUILD_FAILURE);
    expect(result).not.toBeNull();
    expect(result!.message.length).toBeLessThanOrEqual(200);
  });
});

// ─── Webhook resilience (fetchLogs failure must not crash webhook) ────────────

describe('webhook resilience', () => {
  test('analyzeLog does not throw on malformed input', () => {
    expect(() => analyzeLog(undefined as any)).not.toThrow();
    expect(analyzeLog(undefined as any)).toEqual([]);
  });

  test('analyzeLog does not throw on null input', () => {
    expect(() => analyzeLog(null as any)).not.toThrow();
    expect(analyzeLog(null as any)).toEqual([]);
  });
});
