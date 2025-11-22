# Projektový výkaz kvality

Vygenerované: 2025-11-22T21:53:42.856Z

Počet iterácií na každú metódu: `5,000`

### Veľkosť projektu (cloc)

Celkový počet riadkov kódu: **8,580**

| Cieľ | Riadky kódu | Zdroj |
| --- | ---:| --- |
| src | 8,580 | npx cloc |

### Profilovanie

| Režim | Čas (ms) | Veľkosť fronty |
| --- | ---:| ---:|
| Pôvodná implementácia | 10,883.52 | 2,500 |
| Optimalizovaná verzia | 29.01 | 500 |
| Zrýchlenie | 375.16× | — |

Poznámky:
- Pôvodná fronta (JSON stringify) trvala ~218 s na 100k operácií, optimalizovaná verzia pod 1 s.
- Veľkosť fronty klesla z 2 500 duplikátov na 500 unikátnych položiek.

### Pokrytie

| Metrika | Pokryté | Celkom | Pokrytie % |
| --- | ---:| ---:| ---:|
| Statements | 2,287 | 7,272 | 31.45% |
| Lines | 2,287 | 7,272 | 31.45% |
| Branches | 126 | 211 | 59.72% |

Poznámky:
- Vitest pokrýva useActionQueue, služby cache a zdieľané utility.
- Testy používajú vi.fn/vi.mock na simuláciu asynchrónnych handlerov.

### DevOps nástroje

- **GitHub Actions (quality-checks)** (CI) — Lint + vitest s pokrytím pri každom pushi/PR.
- **Vitest + V8 Coverage** (Test) — Poskytuje lokálne aj CI reporty o pokrytí.
- **Automatizovaný portál kvality** (Reporting) — Stránka s profilovaním, pokrytím a bodovaním.

Extra integrácie:
- Husky pre-commit guard na ESLint formátovanie
