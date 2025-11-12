# Projektový výkaz kvality

Vygenerované: 2025-11-11T20:51:00.242Z

Počet iterácií na každú metódu: `8 000`

### Veľkosť projektu (cloc)

Celkový počet riadkov kódu: **10 283**

| Cieľ | Riadky kódu | Zdroj |
| --- | ---:| --- |
| src | 10 283 | fallback počítanie |

### Profilovanie

| Režim | Čas (ms) | Veľkosť fronty |
| --- | ---:| ---:|
| Pôvodná implementácia | 14 516,17 | 2 500 |
| Optimalizovaná verzia | 53,54 | 500 |
| Zrýchlenie | 271.13× | — |

Poznámky:
- Pôvodná fronta (JSON stringify) trvala ~218 s na 100k operácií, optimalizovaná verzia pod 1 s.
- Veľkosť fronty klesla z 2 500 duplikátov na 500 unikátnych položiek.

### Pokrytie

| Metrika | Pokryté | Celkom | Pokrytie % |
| --- | ---:| ---:| ---:|
| Statements | 493 | 6 648 | 7.42% |
| Lines | 493 | 6 648 | 7.42% |
| Branches | 85 | 154 | 55.19% |

Poznámky:
- Vitest pokrýva useActionQueue, služby cache a zdieľané utility.
- Testy používajú vi.fn/vi.mock na simuláciu asynchrónnych handlerov.

### DevOps nástroje

- **GitHub Actions (quality-checks)** (CI) — Lint + vitest s pokrytím pri každom pushi/PR.
- **Vitest + V8 Coverage** (Test) — Poskytuje lokálne aj CI reporty o pokrytí.
- **Automatizovaný portál kvality** (Reporting) — Statická stránka s profilovaním, pokrytím a bodovaním.

Extra integrácie:
- Husky pre-commit guard na ESLint formátovanie
