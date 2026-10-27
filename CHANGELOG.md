# Changelog — Gospodar

Format: SemVer MAJOR.MINOR.PATCH. Date: AAAA-LL-ZZ.

## 2.1.0 — 2026-10-27

Funcții noi, locale, fără rețea și fără dependențe.

- **Reamintire pentru copia de siguranță.** Apare un baner când, după un interval ales (implicit 30 de zile; opțiuni: oprit, 7, 14, 30, 60, 90), nu există nicio copie descărcată sau ultima copie este mai veche decât ultimele modificări. Butoane: copie criptată, copie necriptată, amână 7 zile, nu mai reaminti. Reglaj în Setări › Date și copii de siguranță. Starea (ultima copie, ultima modificare, amânare, interval) stă în `localStorage`, cheia `fff.gospodar.backup`; nu face parte din setul de date și nu intră în exporturi. Aplicația nu rulează în fundal: reamintirea apare doar la deschidere. „Înregistrată” înseamnă doar că fișierul a fost descărcat din acest browser; aplicația nu poate verifica unde a fost păstrat.
- **Parametrii copiei criptate documentați** (în aplicație și în README, 8 limbi): AES-GCM pe 256 de biți, PBKDF2-SHA256 cu 600.000 de iterații, sare de 16 octeți, IV de 12 octeți nou la fiecare export, format `fff-bundle-enc`, Web Crypto. Implementarea nu a fost auditată de terți. Exportul criptat existent nu s-a schimbat.
- **Șabloane de pornire pentru import CSV** (Revolut; BT, BCR, ING). Revolut: coloanele documentate public de terți (Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance), cu mapare după nume de antet și, ca rezervă, după poziție; verificate doar pe exemple sintetice, nu pe un export real. BT, BCR, ING: nu există o specificație publică verificată, deci șablonul aplică doar setări românești uzuale (număr 1.234,56, detectare automată) și este marcat „format de verificat”; utilizatorul confirmă maparea și își salvează propriul profil. Rândurile Revolut cu State diferit de COMPLETED nu sunt filtrate; Fee nu se adaugă la sumă.
- Teste noi: `tests/backup-tpl.test.mjs` (10 verificări: reamintire, rotunjire criptare/decriptare, parolă greșită, text cifrat modificat, șabloane, 8 limbi). Testele existente citesc versiunea din `app.json`.
- README (8 limbi): secțiune nouă, „Stare: stabil”, „Offline: complet”.

## 2.0.0 — 2026-10-26

Reguli de categorizare învățate din istoric și prognoza soldului pe luni.
