import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(MODULE_DIR, '..');
const DOCS_DIR = join(PROJECT_ROOT, 'docs');
const PROFILE_SCRIPT = join(PROJECT_ROOT, 'scripts', 'profileActionQueue.mjs');
const COVERAGE_FILE = join(PROJECT_ROOT, 'coverage', 'coverage-final.json');
const CONFIG_PATH = join(DOCS_DIR, 'quality-config.json');
const REPORT_MD = join(DOCS_DIR, 'QualityReport.md');
const REPORT_HTML = join(DOCS_DIR, 'QualityReport.html');

export const DEFAULT_ITERATIONS = 5000;
const ISSUE_OUTCOME_POINTS = {
  merged: 7,
  discussion: 5,
  pending: 3,
  rejected: 0,
};

export const parseArgs = (argv = process.argv.slice(2)) => {
  const args = { iterations: DEFAULT_ITERATIONS, skipProfile: false, skipCoverage: false, configPath: CONFIG_PATH };

  const readValue = (current, next) => {
    if (current.includes('=')) {
      return current.split('=').slice(1).join('=');
    }
    return next;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current.startsWith('--iterations') || current === '-n') {
      const valueStr = readValue(current, argv[i + 1]);
      const value = Number(valueStr);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid --iterations value: ${valueStr}`);
      }
      args.iterations = value;
      if (!current.includes('=') && valueStr !== undefined) {
        i += 1;
      }
    } else if (current === '--skip-profile') {
      args.skipProfile = true;
    } else if (current === '--skip-coverage') {
      args.skipCoverage = true;
    } else if (current.startsWith('--config') || current === '-c') {
      const valueStr = readValue(current, argv[i + 1]);
      if (!valueStr) throw new Error('Missing value for --config');
      args.configPath = resolve(PROJECT_ROOT, valueStr);
      if (!current.includes('=') && valueStr !== undefined) {
        i += 1;
      }
    }
  }

  return args;
};

export const runProfile = (mode, iterations, execImpl = execSync) => {
  const command = `node "${PROFILE_SCRIPT}" ${mode} ${iterations}`;
  const raw = execImpl(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(raw.trim());
};

export const collectProfiling = (iterations, skip, execImpl = execSync) => {
  if (skip) return null;
  return {
    legacy: runProfile('legacy', iterations, execImpl),
    optimized: runProfile('optimized', iterations, execImpl),
  };
};

export const readCoverageSummary = (coveragePath = COVERAGE_FILE) => {
  if (!existsSync(coveragePath)) return null;

  const raw = JSON.parse(readFileSync(coveragePath, 'utf8'));
  const totals = {
    statements: { covered: 0, total: 0 },
    lines: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
  };

  Object.values(raw).forEach((entry) => {
    const fileEntry = entry;
    if (fileEntry.s) {
      const counts = Object.values(fileEntry.s);
      totals.statements.total += counts.length;
      totals.statements.covered += counts.filter((value) => value > 0).length;
    }
    if (fileEntry.statementMap && fileEntry.s) {
      const ids = Object.keys(fileEntry.statementMap);
      totals.lines.total += ids.length;
      totals.lines.covered += ids.filter((id) => fileEntry.s[id] > 0).length;
    }
    if (fileEntry.b) {
      const branchValues = Object.values(fileEntry.b);
      totals.branches.total += branchValues.reduce((acc, arr) => acc + arr.length, 0);
      totals.branches.covered += branchValues.reduce((acc, arr) => acc + arr.filter((value) => value > 0).length, 0);
    }
  });

  const percentage = (covered, total) => (total === 0 ? '0.00' : ((covered / total) * 100).toFixed(2));

  return {
    statements: { ...totals.statements, pct: percentage(totals.statements.covered, totals.statements.total) },
    lines: { ...totals.lines, pct: percentage(totals.lines.covered, totals.lines.total) },
    branches: { ...totals.branches, pct: percentage(totals.branches.covered, totals.branches.total) },
  };
};

export const collectCloc = (targets = ['src'], execImpl = execSync) => {
  const normalizedTargets = Array.isArray(targets) ? targets : [targets];
  let totalCodeLines = 0;
  const perTarget = [];

  const fallbackExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css'];

  const fallbackCount = (target) => {
    const absolute = resolve(PROJECT_ROOT, target);
    if (!existsSync(absolute)) return 0;

    const stack = [absolute];
    let sum = 0;

    while (stack.length > 0) {
      const current = stack.pop();
      const stats = statSync(current);
      if (stats.isDirectory()) {
        readdirSync(current).forEach((entry) => stack.push(join(current, entry)));
      } else if (stats.isFile()) {
        const ext = extname(current).toLowerCase();
        if (!fallbackExtensions.includes(ext)) continue;
        const content = readFileSync(current, 'utf8');
        if (content.trim().length === 0) continue;
        const lines = content.split(/\r?\n/).length;
        sum += lines;
      }
    }

    return sum;
  };

  normalizedTargets.forEach((target) => {
    try {
      const command = `npx cloc "${target}" --json --quiet`;
      const output = execImpl(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      const json = JSON.parse(output);
      const code = json?.SUM?.code ?? 0;
      if (code === 0) {
        const fallback = fallbackCount(target);
        totalCodeLines += fallback;
        perTarget.push({ target, code: fallback, fallback: true, error: 'cloc returned zero' });
      } else {
        totalCodeLines += code;
        perTarget.push({ target, code });
      }
    } catch (error) {
      const fallback = fallbackCount(target);
      totalCodeLines += fallback;
      perTarget.push({ target, code: fallback, fallback: true, error: error.message });
    }
  });

  return { totalCodeLines, perTarget };
};

export const loadQualityConfig = (configPath = CONFIG_PATH) => {
  if (!existsSync(configPath)) {
    throw new Error(`Missing quality config at ${configPath}.`);
  }
  return JSON.parse(readFileSync(configPath, 'utf8'));
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const computeScores = (config, metrics) => {
  const clocLines = metrics?.cloc?.totalCodeLines ?? 0;
  const issue = config.issue ?? {};

  const clocPoints = clocLines < 10000 ? 4 : 6;
  const complexityValues = ['non-trivial', 'netriviálna'];
  const complexityPoints = complexityValues.includes(issue.complexity) ? 7 : 0;
  let outcomePoints = ISSUE_OUTCOME_POINTS[issue.outcome] ?? 0;
  if (typeof issue.customOutcomePoints === 'number') {
    outcomePoints = issue.customOutcomePoints;
  }

  const issueTotal = clocPoints + complexityPoints + outcomePoints;

  const tests = config.tests ?? {};
  const testPoints = (tests.wroteTests ? 3 : 0) + (tests.coverageImproved ? 2 : 0) + (tests.usedTestDoubles ? 2 : 0);

  const profiling = config.profiling ?? {};
  const profilingPoints =
    (profiling.foundBottleneck ? 2 : 0) +
    (profiling.measuredBeforeAfter ? 2 : 0) +
    (profiling.metricImproved ? 3 : 0);

  const devOps = config.devOps ?? {};
  const serviceCount = Array.isArray(devOps.services) ? devOps.services.length : 0;
  const computedDevOps = Math.min(6, serviceCount * 2 + (devOps.additionalIntegrations?.length ? 2 : 0));
  const devOpsPoints = Math.min(6, typeof devOps.score === 'number' ? devOps.score : computedDevOps);

  const adjustment = clamp(config.adjustment ?? 0, -4, 4);

  const totals = {
    issue: { points: issueTotal, breakdown: { cloc: clocPoints, complexity: complexityPoints, outcome: outcomePoints } },
    tests: { points: testPoints, breakdown: { wroteTests: tests.wroteTests, coverageImproved: tests.coverageImproved, usedTestDoubles: tests.usedTestDoubles } },
    profiling: {
      points: profilingPoints,
      breakdown: {
        foundBottleneck: profiling.foundBottleneck,
        measuredBeforeAfter: profiling.measuredBeforeAfter,
        metricImproved: profiling.metricImproved,
      },
    },
    devOps: {
      points: devOpsPoints,
      breakdown: { serviceCount, additionalIntegrations: devOps.additionalIntegrations?.length ?? 0 },
    },
    adjustment,
  };

  const total = issueTotal + testPoints + profilingPoints + devOpsPoints + adjustment;

  return {
    total,
    max: 40,
    categories: totals,
  };
};

const formatNumber = (value, digits = 2) => {
  if (typeof value === 'number') {
    return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  return value;
};

export const renderMarkdownReport = (payload) => {
  const { generatedAt, iterations, metrics, scores, config } = payload;
  const profiling = metrics.profiling;
  const coverage = metrics.coverage;
  const cloc = metrics.cloc;

  const lines = [
    '# Projektový výkaz kvality',
    '',
    `Vygenerované: ${generatedAt.toISOString()}`,
    '',
    `Počet iterácií na každú metódu: \`${iterations.toLocaleString()}\``,
    '',
  ];

  if (cloc) {
    lines.push('### Veľkosť projektu (cloc)', '', `Celkový počet riadkov kódu: **${cloc.totalCodeLines.toLocaleString()}**`, '');
    if (cloc.perTarget?.length) {
      lines.push('| Cieľ | Riadky kódu | Zdroj |', '| --- | ---:| --- |');
      cloc.perTarget.forEach((entry) => {
        const source = entry.fallback ? 'fallback počítanie' : 'npx cloc';
        lines.push(`| ${entry.target} | ${entry.code.toLocaleString()} | ${source} |`);
      });
      lines.push('');
    }
  }

  if (profiling) {
    lines.push('### Profilovanie', '', '| Režim | Čas (ms) | Veľkosť fronty |', '| --- | ---:| ---:|');
    lines.push(
      `| Pôvodná implementácia | ${formatNumber(profiling.legacy.durationMs)} | ${profiling.legacy.finalQueueSize.toLocaleString()} |`
    );
    lines.push(
      `| Optimalizovaná verzia | ${formatNumber(profiling.optimized.durationMs)} | ${profiling.optimized.finalQueueSize.toLocaleString()} |`
    );
    const speedup = profiling.legacy && profiling.optimized
      ? (profiling.legacy.durationMs / profiling.optimized.durationMs).toFixed(2)
      : 'n/a';
    lines.push(`| Zrýchlenie | ${speedup}× | — |`, '');
    if (config.profiling?.notes?.length) {
      lines.push('Poznámky:', ...config.profiling.notes.map((note) => `- ${note}`), '');
    }
  }

  if (coverage) {
    lines.push('### Pokrytie', '', '| Metrika | Pokryté | Celkom | Pokrytie % |', '| --- | ---:| ---:| ---:|');
    lines.push(
      `| Statements | ${coverage.statements.covered.toLocaleString()} | ${coverage.statements.total.toLocaleString()} | ${coverage.statements.pct}% |`
    );
    lines.push(
      `| Lines | ${coverage.lines.covered.toLocaleString()} | ${coverage.lines.total.toLocaleString()} | ${coverage.lines.pct}% |`
    );
    lines.push(
      `| Branches | ${coverage.branches.covered.toLocaleString()} | ${coverage.branches.total.toLocaleString()} | ${coverage.branches.pct}% |`
    );
    lines.push('');
    if (config.tests?.details?.length) {
      lines.push('Poznámky:', ...config.tests.details.map((note) => `- ${note}`), '');
    }
  }

  if (config.devOps?.services?.length) {
    lines.push('### DevOps nástroje', '');
    config.devOps.services.forEach((service) => {
      lines.push(`- **${service.name}** (${service.phase}) — ${service.description}`);
    });
    lines.push('');
  }

  if (config.devOps?.additionalIntegrations?.length) {
    lines.push('Extra integrácie:', ...config.devOps.additionalIntegrations.map((note) => `- ${note}`), '');
  }

  return lines.join('\n');
};

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const renderHtmlReport = (payload) => {
  const { generatedAt, iterations, metrics, scores, config } = payload;
  const profiling = metrics.profiling;
  const coverage = metrics.coverage;
  const cloc = metrics.cloc;

  const speedup = profiling
    ? (profiling.legacy.durationMs / profiling.optimized.durationMs).toFixed(2)
    : 'n/a';

  const serializeForScript = (value) =>
    JSON.stringify(value, null, 2)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e');

  const clientData = {
    generatedAt: payload.generatedAt,
    iterations,
    metrics: metrics,
    scores,
    services: config.devOps?.services ?? [],
    additionalIntegrations: config.devOps?.additionalIntegrations ?? [],
    profilingNotes: config.profiling?.notes ?? [],
    testingNotes: config.tests?.details ?? [],
  };

  return `<!DOCTYPE html>
<html lang="sk">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Projektový výkaz kvality</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
        background: radial-gradient(circle at top, #0f172a 0%, #020617 35%, #000 100%);
        color: #e2e8f0;
        line-height: 1.6;
      }
      body {
        margin: 0;
        padding: 0;
      }
      .layout {
        max-width: 1200px;
        margin: 0 auto;
        padding: clamp(16px, 2vw, 32px);
      }
      header {
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.95), rgba(16, 185, 129, 0.95));
        border-radius: 24px;
        padding: clamp(24px, 4vw, 36px);
        box-shadow: 0 25px 50px -20px rgba(59, 130, 246, 0.45);
        color: #f8fafc;
        margin-bottom: 32px;
      }
      header h1 {
        margin: 0 0 8px;
        font-size: clamp(2.1rem, 3vw, 2.6rem);
      }
      header p { margin: 0; opacity: 0.85; }
      .score {
        display: flex;
        gap: 16px;
        margin-top: 24px;
        flex-wrap: wrap;
      }
      .score-card {
        background: rgba(15, 23, 42, 0.65);
        padding: 16px 24px;
        border-radius: 18px;
        backdrop-filter: blur(14px);
        min-width: 180px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        flex: 1;
      }
      .score-card h2 { margin: 0; font-size: 1.05rem; opacity: 0.85; }
      .score-card strong { display: block; margin-top: 6px; font-size: 1.8rem; }
      section { margin-bottom: clamp(24px, 4vw, 40px); }
      section h2 { font-size: clamp(1.4rem, 2.4vw, 1.8rem); margin-bottom: 12px; }
      section p { margin: 0 0 12px; opacity: 0.85; }
      section small { opacity: 0.7; }
      table {
        width: 100%;
        border-collapse: collapse;
        border-radius: 16px;
        overflow: hidden;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(148, 163, 184, 0.2);
      }
      th, td { padding: clamp(10px, 1.5vw, 14px) clamp(12px, 2vw, 18px); text-align: left; border-bottom: 1px solid rgba(148, 163, 184, 0.12); }
      th {
        background: rgba(30, 41, 59, 0.6);
      }
      tbody tr:hover {
        background: rgba(51, 65, 85, 0.35);
      }
      .grid {
        display: grid;
        gap: 24px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }
      .card { background: rgba(15, 23, 42, 0.65); padding: clamp(16px, 2.4vw, 22px); border-radius: 18px; border: 1px solid rgba(148, 163, 184, 0.2); backdrop-filter: blur(12px); }
      .card h3 {
        margin-top: 0;
      }
      .badge {
        display: inline-block;
        background: rgba(59, 130, 246, 0.2);
        color: #bfdbfe;
        padding: 2px 8px;
        margin-left: 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        vertical-align: middle;
      }
      footer { text-align: center; opacity: 0.6; font-size: 0.85rem; }
      details { margin-top: 16px; background: rgba(15, 23, 42, 0.55); border-radius: 14px; border: 1px solid rgba(148, 163, 184, 0.2); padding: clamp(12px, 2vw, 18px); }
      details summary { cursor: pointer; font-weight: 600; }
      .note-list {
        margin-top: 16px;
        padding: clamp(12px, 2vw, 18px);
        background: rgba(15, 23, 42, 0.35);
        border-radius: 16px;
        border: 1px solid rgba(148, 163, 184, 0.18);
      }
      .note-list span {
        display: block;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .note-list ul {
        margin: 0;
        padding-left: 20px;
      }
      @media (max-width: 768px) {
        .score-card strong { font-size: 1.6rem; }
        table { font-size: 0.92rem; }
      }
    </style>
  </head>
  <body>
    <div class="layout" id="app">
      <noscript>
        Tento prehľad vyžaduje JavaScript, aby sa načítali aktuálne údaje. Prosím povoľte JavaScript a obnovte stránku.
      </noscript>
    </div>
    <script id="report-data" type="application/json">${serializeForScript(clientData)}</script>
    <script>
      (() => {
        const container = document.getElementById('app');
        const raw = document.getElementById('report-data');
        if (!container || !raw) return;

        const data = JSON.parse(raw.textContent);
        const metrics = data.metrics || {};
        const iterations = data.iterations ?? 0;
        const scores = data.scores || { total: 0 };

        const formatNumber = (value, digits = 2) => {
          if (typeof value === 'number') {
            return value.toLocaleString('sk-SK', {
              minimumFractionDigits: digits,
              maximumFractionDigits: digits,
            });
          }
          return value;
        };

        const formatInt = (value) => {
          if (typeof value === 'number') return value.toLocaleString('sk-SK');
          if (value === null || value === undefined) return '—';
          return value;
        };

        const safeText = (value) => (value === null || value === undefined ? '' : value);

        const renderNoteList = (items) => {
          if (!items || items.length === 0) return '';
          const entries = items
            .map((item) => {
              if (typeof item === 'string') return '<li>' + item + '</li>';
              if (item && item.name) {
                const phase = item.phase ? ' (' + item.phase + ')' : '';
                return '<li><strong>' + item.name + '</strong>' + phase + ' — ' + safeText(item.description) + '</li>';
              }
              return '<li>' + JSON.stringify(item) + '</li>';
            })
            .join('');
          return '<div class="note-list"><span>Poznámky:</span><ul>' + entries + '</ul></div>';
        };

        const renderClocRows = () => {
          if (!metrics.cloc || !metrics.cloc.perTarget || metrics.cloc.perTarget.length === 0) {
            return '<tr><td colspan="3">Žiadne dáta</td></tr>';
          }
          return metrics.cloc.perTarget
            .map((entry) => {
              const source = entry.fallback ? 'fallback počítanie' : 'npx cloc';
              return '<tr><td>' + entry.target + '</td><td>' + formatInt(entry.code) + '</td><td>' + source + '</td></tr>';
            })
            .join('');
        };

        const renderCoverageRows = () => {
          const coverage = metrics.coverage;
          if (!coverage) {
            return '<tr><td colspan="4">Pokrytie nie je k dispozícii. Spustite vitest s coverage.</td></tr>';
          }
          return [
            '<tr><td>Statements</td><td>' + formatInt(coverage.statements.covered) + '</td><td>' + formatInt(coverage.statements.total) + '</td><td>' + coverage.statements.pct + '%</td></tr>',
            '<tr><td>Lines</td><td>' + formatInt(coverage.lines.covered) + '</td><td>' + formatInt(coverage.lines.total) + '</td><td>' + coverage.lines.pct + '%</td></tr>',
            '<tr><td>Branches</td><td>' + formatInt(coverage.branches.covered) + '</td><td>' + formatInt(coverage.branches.total) + '</td><td>' + coverage.branches.pct + '%</td></tr>',
          ].join('');
        };

        const speedup = metrics.profiling
          ? (metrics.profiling.legacy.durationMs / metrics.profiling.optimized.durationMs).toFixed(2)
          : 'n/a';

        const generatedAt = new Date(data.generatedAt).toLocaleString('sk-SK');

        const servicesList = data.services && data.services.length
          ? data.services
              .map((service) => {
                const badge = service.phase ? ' <span class="badge">' + service.phase + '</span>' : '';
                return '<li><strong>' + service.name + '</strong>' + badge + '<p>' + safeText(service.description) + '</p></li>';
              })
              .join('')
          : '<li>Žiadne služby nie sú zdokumentované.</li>';

        const sections = [];

        sections.push(
          '<header>' +
            '<h1>Projektový výkaz kvality</h1>' +
            '<p>Vygenerované ' + generatedAt + '</p>' +
            '<div class="score">' +
              '<div class="score-card">' +
                '<h2>Veľkosť projektu</h2>' +
                '<strong>' + formatInt(metrics.cloc && metrics.cloc.totalCodeLines) + '</strong>' +
                '<small>riadky kódu podľa cloc</small>' +
              '</div>' +
              '<div class="score-card">' +
                '<h2>Iterácie profilovania</h2>' +
                '<strong>' + formatInt(iterations) + '</strong>' +
              '</div>' +
            '</div>' +
          '</header>'
        );

        sections.push(
          '<section>' +
            '<h2>Veľkosť projektu (cloc)</h2>' +
            '<p>Merané podľa SUM/code. V prípade nedostupnosti cloc sa použil fallback, ktorý prechádza súbory (.ts, .tsx, .js, .jsx, .mjs, .cjs, .css).</p>' +
            '<table>' +
              '<thead><tr><th>Cieľ</th><th>Riadky kódu</th><th>Zdroj</th></tr></thead>' +
              '<tbody>' + renderClocRows() + '</tbody>' +
            '</table>' +
          '</section>'
        );

        sections.push(
          '<section>' +
            '<h2>Profilovanie</h2>' +
            '<div class="grid">' +
              '<div class="card">' +
                '<h3>Pôvodná implementácia</h3>' +
                '<p>Čas: <strong>' + (metrics.profiling ? formatNumber(metrics.profiling.legacy.durationMs) : 'n/a') + ' ms</strong></p>' +
                '<p>Veľkosť fronty: <strong>' + (metrics.profiling ? formatInt(metrics.profiling.legacy.finalQueueSize) : 'n/a') + '</strong></p>' +
              '</div>' +
              '<div class="card">' +
                '<h3>Optimalizovaná verzia</h3>' +
                '<p>Čas: <strong>' + (metrics.profiling ? formatNumber(metrics.profiling.optimized.durationMs) : 'n/a') + ' ms</strong></p>' +
                '<p>Veľkosť fronty: <strong>' + (metrics.profiling ? formatInt(metrics.profiling.optimized.finalQueueSize) : 'n/a') + '</strong></p>' +
              '</div>' +
              '<div class="card">' +
                '<h3>Zrýchlenie</h3>' +
                '<p><strong>' + speedup + '</strong>&times; rýchlejšie po refaktoringu.</p>' +
                '<p>Využíva cache dedupe kľúčov a set na sledovanie položiek.</p>' +
              '</div>' +
            '</div>' +
            renderNoteList(data.profilingNotes) +
          '</section>'
        );

        sections.push(
          '<section>' +
            '<h2>Pokrytie</h2>' +
            '<table>' +
              '<thead><tr><th>Metrika</th><th>Pokryté</th><th>Celkom</th><th>Pokrytie %</th></tr></thead>' +
              '<tbody>' + renderCoverageRows() + '</tbody>' +
            '</table>' +
            renderNoteList(data.testingNotes) +
          '</section>'
        );

        sections.push(
          '<section>' +
            '<h2>DevOps</h2>' +
            '<div class="card">' +
              '<h3>Integrované služby</h3>' +
              '<ul>' + servicesList + '</ul>' +
              renderNoteList(data.additionalIntegrations) +
            '</div>' +
          '</section>'
        );

        sections.push(
          '<footer>' +
            'Generované pomocou automatizovaného profilovania, analýzy pokrytia a DevOps inventúry.' +
          '</footer>'
        );

        container.innerHTML = sections.join('');
      })();
    </script>
  </body>
</html>`;
};

export const buildPayload = ({ iterations, profiling, coverage, cloc, config }) => ({
  generatedAt: new Date(),
  iterations,
  metrics: { profiling, coverage, cloc },
  config,
  scores: computeScores(config, { cloc }),
});

export const writeReports = (payload) => {
  if (!existsSync(DOCS_DIR)) {
    mkdirSync(DOCS_DIR, { recursive: true });
  }
  const markdown = renderMarkdownReport(payload);
  writeFileSync(REPORT_MD, markdown, 'utf8');
  const html = renderHtmlReport(payload);
  writeFileSync(REPORT_HTML, html, 'utf8');
  return { markdownPath: REPORT_MD, htmlPath: REPORT_HTML };
};

export const main = () => {
  const args = parseArgs();
  const config = loadQualityConfig(args.configPath);

  const profiling = collectProfiling(args.iterations, args.skipProfile);
  const coverage = args.skipCoverage ? null : readCoverageSummary();
  const clocTargets = config.issue?.clocTargets ?? ['src'];
  const cloc = collectCloc(clocTargets);

  const payload = buildPayload({ iterations: args.iterations, profiling, coverage, cloc, config });
  const { markdownPath, htmlPath } = writeReports(payload);
  console.log(`Projektový výkaz kvality bol aktualizovaný:\n - ${markdownPath}\n - ${htmlPath}`);
};

const executedDirectly = () => {
  try {
    return pathToFileURL(process.argv[1] ?? '').href === import.meta.url;
  } catch {
    return false;
  }
};

if (executedDirectly()) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
