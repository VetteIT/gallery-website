import { describe, expect, it, vi } from 'vitest';

import {
  collectCloc,
  computeScores,
  renderHtmlReport,
  renderMarkdownReport,
} from '../../scripts/generateQualityReport.mjs';

const baseConfig = {
  issue: {
    clocTargets: ['src'],
    complexity: 'netriviálna',
    outcome: 'merged',
  },
  tests: {
    wroteTests: true,
    coverageImproved: true,
    usedTestDoubles: true,
  },
  profiling: {
    foundBottleneck: true,
    measuredBeforeAfter: true,
    metricImproved: true,
  },
  devOps: {
    services: [
      { name: 'GitHub Actions', phase: 'CI', description: 'Lint + test on push' },
      { name: 'Automated Quality Portal', phase: 'Reporting', description: 'Static report' },
      { name: 'Vitest Coverage', phase: 'Test', description: 'Coverage instrumentation' },
    ],
  },
  adjustment: 1,
};

const baseMetrics = {
  cloc: { totalCodeLines: 8240 },
  profiling: {
    legacy: { durationMs: 14855.99, finalQueueSize: 2500 },
    optimized: { durationMs: 57.99, finalQueueSize: 500 },
  },
  coverage: {
    statements: { covered: 493, total: 6648, pct: '7.42' },
    lines: { covered: 493, total: 6648, pct: '7.42' },
    branches: { covered: 85, total: 154, pct: '55.19' },
  },
};

describe('quality scoring', () => {
  it('computes category totals using rubric thresholds', () => {
    const scores = computeScores(baseConfig, { cloc: baseMetrics.cloc });
    expect(scores.categories.issue.breakdown.cloc).toBe(4); // < 10k LOC
    expect(scores.categories.issue.breakdown.complexity).toBe(7);
    expect(scores.categories.issue.breakdown.outcome).toBe(7);
    expect(scores.categories.tests.points).toBe(7);
    expect(scores.categories.profiling.points).toBe(7);
    expect(scores.categories.devOps.points).toBe(6);
    expect(scores.total).toBe(39);
  });

  it('produces markdown with scorecard table', () => {
    const payload = {
      generatedAt: new Date('2025-11-11T19:54:58.538Z'),
      iterations: 8000,
      metrics: baseMetrics,
      config: baseConfig,
      scores: computeScores(baseConfig, { cloc: baseMetrics.cloc }),
    };

    const markdown = renderMarkdownReport(payload);
    expect(markdown).toContain('# Projektový výkaz kvality');
    expect(markdown).toContain('| Riešenie issue |');
    expect(markdown).toContain('Počet iterácií na každú metódu');
  });

  it('renders HTML portal with profiling, coverage, and DevOps sections', () => {
    const payload = {
      generatedAt: new Date('2025-11-11T19:54:58.538Z'),
      iterations: 8000,
      metrics: baseMetrics,
      config: baseConfig,
      scores: computeScores(baseConfig, { cloc: baseMetrics.cloc }),
    };

    const html = renderHtmlReport(payload);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Projektový výkaz kvality');
    expect(html).toContain('GitHub Actions');
    expect(html).toContain('Zrýchlenie');
  });

  it('parses cloc output via injected executor', () => {
    const exec = vi.fn(() => '{"SUM": {"code": 1234}}');
    const result = collectCloc(['src'], exec);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(result.totalCodeLines).toBe(1234);
  });
});
