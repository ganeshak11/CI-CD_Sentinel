/**
 * errorPatterns.ts — Error Pattern Library for RCA Engine
 *
 * Exports all 8 regex patterns as named constants used by rcaService
 * to classify CI/CD log failures. Each pattern includes:
 *  - type: the error category
 *  - severity: critical | warning | info
 *  - patterns: array of regex patterns to match against log lines
 *
 * Severity rules (from task spec):
 *  - oom_kill + missing_secret → critical
 *  - build_failure + test_failure → warning
 *  - timeout, network_error, dependency_conflict, lint_error → info
 */

import { ErrorPattern } from '../types/deployment.types';

// ─── Pattern Type ─────────────────────────────────────────────────────────────

export type ErrorPatternType = ErrorPattern['type'];

export type ErrorSeverity = ErrorPattern['severity'];

// ─── Pattern Definition ───────────────────────────────────────────────────────

export interface PatternDefinition {
  type: ErrorPatternType;
  severity: ErrorSeverity;
  /** Exact key phrases — matched literally (confidence 0.9) */
  exactPhrases: string[];
  /** Regex patterns — matched via RegExp (confidence 0.6) */
  regexPatterns: RegExp[];
}

// ─── All 8 Pattern Definitions ────────────────────────────────────────────────

export const BUILD_FAILURE: PatternDefinition = {
  type: 'build_failure',
  severity: 'warning',
  exactPhrases: [
    'Cannot find module',
    'SyntaxError',
    'tsc: error TS',
  ],
  regexPatterns: [
    /Cannot find module/i,
    /SyntaxError/i,
    /tsc:\s*error\s*TS/i,
  ],
};

export const TEST_FAILURE: PatternDefinition = {
  type: 'test_failure',
  severity: 'warning',
  exactPhrases: [
    'FAIL src/',
    '● Test suite failed',
    'AssertionError',
  ],
  regexPatterns: [
    /FAIL\s+src\//i,
    /●\s*Test suite failed/i,
    /Assert(?:ion)?Error/i,
  ],
};

export const OOM_KILL: PatternDefinition = {
  type: 'oom_kill',
  severity: 'critical',
  exactPhrases: [
    'Out of memory',
    'Killed',
    'exit code 137',
  ],
  regexPatterns: [
    /Out of memory/i,
    /\bKilled\b/,
    /exit code 137/i,
  ],
};

export const TIMEOUT: PatternDefinition = {
  type: 'timeout',
  severity: 'info',
  exactPhrases: [
    'Timeout of',
    'timed out after',
    'ETIMEDOUT',
  ],
  regexPatterns: [
    /Timeout of/i,
    /timed out after/i,
    /ETIMEDOUT/,
  ],
};

export const MISSING_SECRET: PatternDefinition = {
  type: 'missing_secret',
  severity: 'critical',
  exactPhrases: [
    'Error: GITHUB_TOKEN',
  ],
  regexPatterns: [
    /secret.*not found/i,
    /undefined.*SECRET/i,
    /Error:\s*GITHUB_TOKEN/i,
  ],
};

export const NETWORK_ERROR: PatternDefinition = {
  type: 'network_error',
  severity: 'info',
  exactPhrases: [
    'ECONNREFUSED',
    'ENOTFOUND',
    'fetch failed',
  ],
  regexPatterns: [
    /ECONNREFUSED/,
    /ENOTFOUND/,
    /fetch failed/i,
  ],
};

export const DEPENDENCY_CONFLICT: PatternDefinition = {
  type: 'dependency_conflict',
  severity: 'info',
  exactPhrases: [
    'peer dep',
    'ERESOLVE',
    'version conflict',
  ],
  regexPatterns: [
    /peer dep/i,
    /ERESOLVE/,
    /version conflict/i,
  ],
};

export const LINT_ERROR: PatternDefinition = {
  type: 'lint_error',
  severity: 'info',
  exactPhrases: [
    'ESLint:',
    'Prettier:',
    'no-unused',
    'Parsing error:',
  ],
  regexPatterns: [
    /ESLint:/,
    /Prettier:/,
    /no-unused/,
    /Parsing error:/,
  ],
};

// ─── All Patterns (ordered by severity: critical → warning → info) ────────────

export const ALL_PATTERNS: PatternDefinition[] = [
  OOM_KILL,
  MISSING_SECRET,
  BUILD_FAILURE,
  TEST_FAILURE,
  TIMEOUT,
  NETWORK_ERROR,
  DEPENDENCY_CONFLICT,
  LINT_ERROR,
];

// ─── Matching Helpers ─────────────────────────────────────────────────────────

export interface PatternMatch {
  type: ErrorPatternType;
  severity: ErrorSeverity;
  message: string;
  confidence: number;
}

/**
 * Check a single log line against a pattern definition.
 * Returns a match with confidence 0.9 for exact phrase hits, 0.6 for regex-only.
 * Returns null if no match.
 */
export function matchLine(line: string, pattern: PatternDefinition): PatternMatch | null {
  // Check exact phrases first (higher confidence)
  for (const phrase of pattern.exactPhrases) {
    if (line.includes(phrase)) {
      return {
        type: pattern.type,
        severity: pattern.severity,
        message: line.trim().substring(0, 200), // cap message length
        confidence: 0.9,
      };
    }
  }

  // Check regex patterns (lower confidence)
  for (const regex of pattern.regexPatterns) {
    if (regex.test(line)) {
      return {
        type: pattern.type,
        severity: pattern.severity,
        message: line.trim().substring(0, 200),
        confidence: 0.6,
      };
    }
  }

  return null;
}
