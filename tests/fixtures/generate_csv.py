#!/usr/bin/env python3
"""Generează fixture-uri CSV GENERICE și SINTETICE pentru robustețea importului (Python 3.13: modulul `csv`, `codecs`).
NU imită exporturile niciunei bănci. Fiecare fișier randează aceleași tranzacții canonice în alt dialect; <nume>.expected.json
conține rezultatul așteptat (data ISO, suma în subunități, descrierea) scris din datele sursă, nu din aplicație.
Rulare: python3 tests/fixtures/generate_csv.py tests/fixtures"""
import csv, io, json, os, sys, codecs, datetime as dt
from decimal import Decimal as D
out = sys.argv[1] if len(sys.argv) > 1 else 'tests/fixtures'
os.makedirs(out, exist_ok=True)
CAN = [
 ('2026-03-01', D('-1234.56'), 'Cumpărături Mega Image, București'),
 ('2026-03-02', D('2500.00'), 'Salariu ș ț ă â î'),
 ('2026-03-03', D('-0.99'), 'Taxă "card"'),
 ('2026-03-04', D('-15.00'), 'Linie\nnouă'),
 ('2026-03-05', D('1000000.00'), 'Bonus mare'),
 ('2026-03-06', D('-7.50'), 'Transport; metrou'),
 ('2026-03-15', D('-42.10'), 'Plată facturi ÎNTREȚINERE'),
 ('2026-12-31', D('0.01'), 'Dobândă'),
]
def exp(rows=CAN, tf=lambda s: s):
    return [{'date': d, 'amt': int(a * 100), 'desc': ' '.join(tf(s).split())} for d, a, s in rows]
def put(name, data, rows=CAN, tf=lambda s: s, extra=None):
    open(f'{out}/{name}', 'wb').write(data if isinstance(data, bytes) else data.encode('utf-8'))
    e = {'rows': exp(rows, tf)}; e.update(extra or {})
    json.dump(e, open(f'{out}/{name}.expected.json', 'w'), ensure_ascii=False, indent=1)
def render(rows, delim, hdr, fmtd, fmta, nl='\n', quoting=csv.QUOTE_MINIMAL, tf=lambda s: s):
    b = io.StringIO(); w = csv.writer(b, delimiter=delim, lineterminator=nl, quoting=quoting)
    if hdr: w.writerow(hdr)
    for d, a, s in rows: w.writerow([fmtd(d), tf(s), fmta(a)])
    return b.getvalue()
iso = lambda d: d
dmy = lambda d: f'{d[8:]}.{d[5:7]}.{d[:4]}'
mdy = lambda d: f'{d[5:7]}/{d[8:]}/{d[:4]}'
def num_eu(a): return f'{a:,.2f}'.replace(',', '#').replace('.', ',').replace('#', '.')
def num_us(a): return f'{a:,.2f}'
dot = lambda a: f'{a:.2f}'

put('comma_dot_iso.csv', render(CAN, ',', ['Date', 'Description', 'Amount'], iso, dot))
put('semicolon_eu_bom.csv', codecs.BOM_UTF8 + render(CAN, ';', ['Data', 'Descriere', 'Suma'], dmy, num_eu).encode('utf-8'))
put('tab_us_mdy.tsv', render(CAN, '\t', ['Date', 'Memo', 'Amount'], mdy, num_us))
# debit / credit separate (valori pozitive în fiecare coloană)
b = io.StringIO(); w = csv.writer(b, delimiter=';', lineterminator='\n'); w.writerow(['Data', 'Descriere', 'Debit', 'Credit'])
for d, a, s in CAN: w.writerow([dmy(d), s, num_eu(-a) if a < 0 else '', num_eu(a) if a > 0 else ''])
put('debit_credit_split.csv', b.getvalue())
# preambul + linii goale + CRLF + linii goale la final
body = render(CAN, ';', ['Data', 'Descriere', 'Suma'], dmy, num_eu, nl='\r\n').split('\r\n')
txt = 'Extras de cont (SINTETIC)\r\nTitular: Test Test\r\nPerioada: 01.03.2026 - 31.12.2026\r\n\r\n' + '\r\n'.join(body[:3] + [''] + body[3:5] + ['', ''] + body[5:]) + '\r\n\r\n\r\n'
put('preamble_blank_crlf.csv', txt)
# Windows-1250 (cedilă ş ţ, singura formă reprezentabilă) și ISO-8859-2
cd = lambda s: s.replace('ș', 'ş').replace('ț', 'ţ').replace('Ț', 'Ţ').replace('Ș', 'Ş')
put('cp1250_semicolon.csv', render(CAN, ';', ['Data', 'Descriere', 'Suma'], dmy, num_eu, tf=cd).encode('cp1250'), tf=cd)
put('latin2_semicolon.csv', render(CAN, ';', ['Data', 'Descriere', 'Suma'], dmy, num_eu, tf=cd).encode('iso8859-2'), tf=cd)
put('utf16le_bom.csv', codecs.BOM_UTF16_LE + render(CAN, ';', ['Data', 'Descriere', 'Suma'], dmy, num_eu).encode('utf-16-le'))
put('cr_only_newlines.csv', render(CAN, ',', ['Date', 'Description', 'Amount'], iso, dot, nl='\r'))
put('quote_all.csv', render(CAN, ',', ['Date', 'Description', 'Amount'], iso, dot, quoting=csv.QUOTE_ALL))
# simboluri monetare, NBSP/NNBSP ca separator de mii, minus Unicode
def num_sym(a):
    s = f'{abs(a):,.2f}'.replace(',', ' ' if int(abs(a)) % 2 else ' ').replace('.', ',')   # alternează NBSP / NNBSP (doar pentru mii)
    return ('−' if a < 0 else '') + s + ' RON'
put('currency_nbsp_unicode_minus.csv', render(CAN, ';', ['Data', 'Descriere', 'Suma'], dmy, num_sym))
# negative cu paranteze și minus la sfârșit (US)
def num_par(a, k=[0]):
    k[0] += 1
    return f'({num_us(-a)})' if a < 0 and k[0] % 2 else (num_us(-a) + '-' if a < 0 else num_us(a))
put('us_parentheses_trailing_minus.csv', render(CAN, ',', ['Date', 'Memo', 'Amount'], mdy, num_par))
# formate de dată
put('date_ddmmyy_slash.csv', render(CAN, ';', ['Data', 'Descriere', 'Suma'], lambda d: f'{d[8:]}/{d[5:7]}/{d[2:4]}', num_eu))
put('date_yyyymmdd.csv', render(CAN, ',', ['Date', 'Description', 'Amount'], lambda d: d.replace('-', ''), dot))
put('date_iso_datetime.csv', render(CAN, ',', ['Date', 'Description', 'Amount'], lambda d: d + ('T14:22:05Z' if int(d[8:]) % 2 else ' 08:00:00'), dot))
put('date_dash_ddmmyyyy.csv', render(CAN, ';', ['Data', 'Descriere', 'Suma'], lambda d: f'{d[8:]}-{d[5:7]}-{d[:4]}', num_eu))
# fără antet
put('no_header.csv', render(CAN, ',', None, iso, dot), extra={'header': False})
# rânduri neregulate (mai puține / mai multe câmpuri) — rândurile valide se păstrează
rag = render(CAN, ',', ['Date', 'Description', 'Amount'], iso, dot).split('\n')
rag[3] = rag[3] + ',extra,câmp'          # rând cu coloane în plus (rândul 3 începe cu 2026-03-02? vezi expected)
put('ragged_extra_columns.csv', '\n'.join(rag))
# rânduri cu erori: dată invalidă, sumă invalidă, sumă lipsă
bad = render(CAN, ',', ['Date', 'Description', 'Amount'], iso, dot).split('\n')
bad_txt = '\n'.join(bad[:3]) + '\n2026-13-45,Dată invalidă,10.00\n2026-03-20,Sumă invalidă,abc\n2026-03-21,Sumă lipsă,\n' + '\n'.join(bad[3:])
put('bad_rows.csv', bad_txt, rows=CAN, extra={'errors': 3, 'ok': len(CAN)})
# formule în descriere (text, nu se evaluează) și spații în jur
inj = [('2026-04-01', D('-5.00'), '=HYPERLINK("http://exemplu.invalid","x")'), ('2026-04-02', D('-6.00'), '+cmd|calc'), ('2026-04-03', D('-7.00'), '@SUM(1+1)'), ('2026-04-04', D('-8.00'), '  spații  multe   aici  ')]
put('formula_like_text.csv', render(inj, ',', ['Date', 'Description', 'Amount'], iso, dot), rows=inj)
# mare, determinist: 5000 rânduri
big = [(dt.date(2020, 1, 1) + dt.timedelta(days=i % 2000)).isoformat() for i in range(5000)]
brows = [(big[i], D(((i * 7919) % 200001) - 100000) / 100, f'Tranzacție {i} ăîșț') for i in range(5000)]
put('large_5000.csv', render(brows, ';', ['Data', 'Descriere', 'Suma'], dmy, num_eu), rows=brows)
# virgulă ca separator de câmp + sume europene între ghilimele; apostrof ca separator de mii (stil elvețian)
put('comma_sep_eu_quoted_amounts.csv', render(CAN, ',', ['Date', 'Description', 'Amount'], iso, num_eu, quoting=csv.QUOTE_NONNUMERIC))
put('apostrophe_thousands.csv', render(CAN, ';', ['Date', 'Description', 'Amount'], iso, lambda a: f'{a:,.2f}'.replace(',', "'")))
# ghilimele neînchise în ultimul rând: nu trebuie să blocheze; rândurile dinainte rămân
unt = render(CAN, ',', ['Date', 'Description', 'Amount'], iso, dot) + '2026-05-05,"descriere neînchisă,10.00\n'
put('unterminated_quote.csv', unt, rows=CAN, extra={'tolerant_extra_rows': True})
# ambiguități: toate zilele ≤ 12 (MM/DD vs DD/MM) și sume tip „1,234” (mii US sau zecimale EU). Intenția: MM/DD/YYYY și separator de mii „,”.
AMB = [('2026-03-04', D('-1234'), 'Ambiguu 1'), ('2026-05-06', D('2500'), 'Ambiguu 2'), ('2026-07-08', D('-3000'), 'Ambiguu 3'), ('2026-09-10', D('-125000'), 'Ambiguu 4')]
put('ambiguous_us_intent.csv', render(AMB, ',', ['Date', 'Memo', 'Amount'], mdy, lambda a: f'"{a:,.0f}"' if False else f'{a:,.0f}'), rows=AMB, extra={'ambiguous': True})
print('ok')
