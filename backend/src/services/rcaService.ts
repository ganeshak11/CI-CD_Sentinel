/**
 * rcaService.ts — Root Cause Analysis Engine
 *
 * Analyzes CI/CD log text to identify error patterns and classify failures.
 * Uses the pattern library from errorPatterns.ts (never hardcodes patterns).
 *
 * Key behavior:
 *  - Returns ErrorPattern[] ordered by confidence DESC
 *  - Deduplicates: only the highest-confidence match per pattern type is kept
 *  - Severity is determined by the pattern definition, not the log content
 */

import {
  ALL_PATTERNS,
  matchLine,
  PatternMatch,
} from '../utils/errorPatterns';
import { ErrorPattern } from '../types/deployment.types';

/**
 * Analyze log text and return detected error patterns ordered by confidence DESC.
 *
 * Algorithm:
 *  1. Split log text into individual lines
 *  2. For each line, test against all 8 pattern definitions
 *  3. For each pattern type, keep only the highest-confidence match
 *  4. Sort results by confidence DESC
 *
 * @param logText — the raw log text (typically last 500 lines)
 * @returns Array of detected error patterns (without id/detectedAt — those are added by graphService)
 */
export function analyzeLog(
  logText: string
): Omit<ErrorPattern, 'id' | 'detectedAt'>[] {
  if (!logText || logText.trim().length === 0) {
    return [];
  }

  const lines = logText.split('\n');

  // Map: patternType → best match (highest confidence)
  const bestMatches = new Map<string, PatternMatch>();

  for (const line of lines) {
    if (!line.trim()) continue; // skip empty lines

    for (const pattern of ALL_PATTERNS) {
      const match = matchLine(line, pattern);
      if (match) {
        const existing = bestMatches.get(match.type);
        // Keep the match with higher confidence, or replace if equal (latest line wins)
        if (!existing || match.confidence >= existing.confidence) {
          bestMatches.set(match.type, match);
        }
      }
    }
  }

  // Convert to ErrorPattern format (without id/detectedAt) and sort by confidence DESC
  const results: Omit<ErrorPattern, 'id' | 'detectedAt'>[] = [];

  for (const match of bestMatches.values()) {
    results.push({
      type: match.type as ErrorPattern['type'],
      message: match.message,
      severity: match.severity,
      confidence: match.confidence,
    });
  }

  // Sort by confidence descending, then by severity priority
  results.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    // Tie-breaker: critical > warning > info
    return severityRank(b.severity) - severityRank(a.severity);
  });

  return results;
}

/**
 * Numeric rank for severity sorting (higher = more severe).
 */
function severityRank(severity: string): number {
  switch (severity) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'info':
      return 1;
    default:
      return 0;
  }
}
