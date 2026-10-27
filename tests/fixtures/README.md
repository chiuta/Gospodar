# Fixture-uri CSV (GENERICE, SINTETICE)

Fișierele sunt **sintetice**, generate la 2026-10-28 cu Python 3.13 (`csv`, `codecs`) prin `python3 -I tests/fixtures/generate_csv.py tests/fixtures`. **Nu sunt exporturi ale vreunei bănci** și nu imită formatul niciuneia (nu există fișiere „BT/BCR/ING” etc.); sunt dialecte CSV generice pentru robustețea importului. Aceleași 8 tranzacții canonice sunt redate în dialecte diferite; `<fișier>.expected.json` conține rezultatul așteptat (dată ISO, sumă în subunități, descriere), scris din datele sursă ale generatorului, nu din ieșirea aplicației.

Testul: `node tests/csv-fixtures.test.mjs [filtru]` (PW_ROOT, CHROMIUM_PATH).

| Fișier | Caz acoperit |
|---|---|
| `comma_dot_iso.csv` | separator `,`, zecimale cu punct, date ISO, ghilimele, virgulă / ghilimele duble / linie nouă în câmp, diacritice, sume cu semn |
| `quote_all.csv` | toate câmpurile între ghilimele |
| `cr_only_newlines.csv` | sfârșituri de linie doar CR |
| `semicolon_eu_bom.csv` | `;`, zecimale cu virgulă, mii cu punct, DD.MM.YYYY, BOM UTF-8 |
| `comma_sep_eu_quoted_amounts.csv` | separator `,` cu sume europene între ghilimele |
| `apostrophe_thousands.csv` | apostrof ca separator de mii |
| `tab_us_mdy.tsv` | TAB, MM/DD/YYYY, sume `1,234.56` |
| `us_parentheses_trailing_minus.csv` | negative `(1,234.56)` și `1,234.56-` |
| `debit_credit_split.csv` | coloane separate Debit / Credit (valori pozitive în fiecare) |
| `preamble_blank_crlf.csv` | preambul de 3 rânduri, linii goale în interior și la final, CRLF |
| `cp1250_semicolon.csv`, `latin2_semicolon.csv` | Windows-1250 și ISO-8859-2 (cu ş/ţ cu sedilă, singurele reprezentabile) |
| `utf16le_bom.csv` | UTF-16 LE cu BOM |
| `currency_nbsp_unicode_minus.csv` | „RON”, NBSP / NNBSP ca separator de mii, minus Unicode (U+2212) |
| `date_ddmmyy_slash.csv`, `date_yyyymmdd.csv`, `date_iso_datetime.csv`, `date_dash_ddmmyyyy.csv` | formate de dată (an pe 2 cifre, compact, ISO cu oră / `T…Z`, cu cratime) |
| `no_header.csv` | fără rând de antet |
| `ragged_extra_columns.csv` | un rând cu coloane în plus |
| `bad_rows.csv` | dată invalidă, sumă invalidă, sumă lipsă: 3 rânduri cu eroare, 8 bune |
| `formula_like_text.csv` | descrieri care încep cu `=`, `+`, `@`, spații multiple |
| `unterminated_quote.csv` | ghilimele neînchise în ultimul rând (să nu blocheze) |
| `ambiguous_us_intent.csv` | zile ≤ 12 și sume `1,234`: autodetecția nu poate ști; testul verifică alegerea manuală a formatului |
| `large_5000.csv` (≈220 KB) | 5000 de rânduri, determinist |

## Limite
- Rezultatele sunt verificate doar pe aceste fișiere sintetice; nu s-a testat pe exporturi reale ale vreunei instituții.
- Ambiguitățile reale (DD/MM vs MM/DD, `1,234` mii vs zecimale) rămân ambigue; aplicația alege implicit după limbă (RO: DD/MM și zecimale cu virgulă) și lasă utilizatorul să corecteze.
- Cazul `unterminated_quote.csv` verifică doar că rândurile bune dinainte se păstrează și că pagina nu cade.
