# Digitale Schriftarten für den Koran-Text: Umfassender Leitfaden zu Fonts, Technik, Lizenzen und Praxis

## TL;DR
- **Für die meisten Zwecke (Anki, LaTeX, Web, Print) ist die Kombination aus dem offiziellen KFGQPC-„Uthmanic Hafs"-Unicode-Font (Medina, kostenlos, aber restriktive Lizenz) und Amiri Quran / Scheherazade New (beide OFL, frei modifizierbar) die beste Wahl** — Amiri Quran und Scheherazade New sind wegen der SIL Open Font License die einzigen wirklich uneingeschränkt einbettbaren, hochwertigen Quran-tauglichen Fonts.
- **Es gibt zwei grundlegend verschiedene Font-Technologien:** Unicode-basierte Fonts (Text als Unicode gespeichert, durchsuch- und kopierbar) und seitenbasierte/glyph-basierte QCF-Fonts (eine Font-Datei je Mushaf-Seite mit privaten Codepoints — perfekte Seitentreue zum Medina-Mushaf, aber kein Copy-Paste und keine Suche). Text und Font MÜSSEN zusammenpassen (z. B. Tanzil-Uthmani-Text ≠ KFGQPC-Text ≠ QCF-Glyphcodes).
- **Für Hifz/Memorierung in Anki** empfiehlt sich der seitentreue Medina-Mushaf-Ansatz (QCF pro Seite oder fertige „Medina Font"-Decks); für flexible Kartentexte der Unicode-Font „KFGQPC Uthmanic Script HAFS" (als `_font.ttf` im media-Ordner). Für farbiges Tajweed eignet sich Amiri Quran Colored (COLR/CPAL) bzw. QCF V4.

## Key Findings

1. **Der De-facto-Standard ist der Medina-Mushaf** in der Kalligrafie von Uthman Taha, produziert vom King Fahd Glorious Quran Printing Complex (KFGQPC). Davon existieren zwei Font-Familien: die Unicode-basierte „Uthmanic Hafs" (für Fließtext) und die seitenbasierten QCF-Fonts V1/V2/V4 (für seitengetreue Mushaf-Darstellung, z. B. auf Quran.com).
2. **Lizenz-Kernproblem:** Die KFGQPC-Fonts sind zwar kostenlos, aber ihre eingebettete EULA verbietet ausdrücklich Modifikation, Verkauf und Reverse Engineering. Wer Fonts modifizieren oder rechtssicher kommerziell einbetten will, muss zu OFL-Fonts (Amiri, Scheherazade New, Lateef, Harmattan, Noto) greifen.
3. **Amiri Quran (Khaled Hosny, OFL)** ist die beste frei lizenzierte Alternative im Naskh-Stil, inklusive einer Variante **Amiri Quran Colored** mit eingebauten Tajweed-artigen Farbmarkierungen über COLR/CPAL-Farbfont-Technik.
4. **Rendering-Fallstricke** entstehen v. a. bei Mark-Positionierung (Tashkeel/Diakritika) und bei der Zahl-Shaping (bekannter HarfBuzz-Bug bei KFGQPC-Versnummern). Farbige Tajweed-Fonts (COLRv1 vs. OT-SVG) werden je nach Browser unterschiedlich unterstützt.
5. **Typst** unterstützt RTL/Arabisch grundsätzlich (über `text(dir: rtl, lang: "ar")`), aber ohne die ausgereifte Automatik von LaTeX; das Community-Paket **auto-bidi** verbessert die automatische Richtungserkennung erheblich.

## Details

### 1. Die wichtigsten Quran-spezifischen Fonts

#### 1.1 KFGQPC-Fonts (King Fahd Glorious Quran Printing Complex, Medina)

Der KFGQPC in Medina ist die maßgebliche Quelle. Offizielle Bezugsquellen:
- **`https://fonts.qurancomplex.gov.sa/`** — die „various"-Fonts (Unicode-Fließtext-Fonts, Symbol-Fonts).
- **`https://qurancomplex.gov.sa/techquran/dev/`** — Entwicklerbereich mit Text + passenden Fonts in CSV/HTML/JSON/SQL/XLSX/XML für 8 Qira'at.
- **`http://qurancomplex.gov.sa/TTF/`** + Dateiname bzw. der Windows-Installer `AllPartsFonts.zip` — die seitenbasierten Mushaf-(QCF-)Fonts.
- Praktische Spiegel/Repos: `github.com/nuqayah/qpc-fonts`, `github.com/thetruetruth/quran-data-kfgqpc`, sowie das AUR-Paket `ttf-qurancomplex-fonts`.

**Wichtigste KFGQPC-Fonts und Versionen:**

- **KFGQPC Uthmanic Script HAFS** (Uthmanic Hafs) — der Unicode-Fließtext-Font für die Hafs-Lesart im Uthmani-Rasm. Versionshistorie:
  - `UthmanicHafs1 Ver09` — die klassische, weit gespiegelte Version (interne Version 0.09).
  - `UthmanicHafs1_Ver18` / „Version 0.18" — offizielle Version von 2021, u. a. über die Quran-Foundation-CDN als `UthmanicHafs1Ver18.woff2/.ttf` ausgeliefert. Bold-Variante trägt „Version 0.13".
  - **`UthmanicHafs_v22`** — die aktuellste offizielle Version (2024), mit korrekt unterstützter Kashida/Elongation; verfügbar als `UthmanicHafs_v22.zip` über die offizielle Seite (`fonts.qurancomplex.gov.sa/wp-content/uploads/fonts/`) und als `UthmanicHafs_V22.ttf` über die Tarteel-QUL-CDN.
  - Zwei Schnitte: Regular und Bold. Designer laut Metadaten: Ashfaq Ahmad Niazi.
- **KFGQPC HAFS Smart** („Hafs für Smart-Devices", Version 8) — ein *separater* Font, nicht bloß eine Version. Laut offizieller KFGQPC-Beschreibung dient er dazu, „Verse im osmanischen Schriftbild auf Smart-Geräten anzuzeigen … nicht dazu, die gesamte Mushaf-Seite identisch zum Medina-Mushaf darzustellen, sondern nur auf Vers-Ebene" (z. B. Suchergebnisse, Tafsir-Bücher). Also für Vers-Snippets, nicht für Seitentreue.
- **KFGQPC Uthman Taha Naskh** — Naskh-Font (Regular `UthmanTN1 Ver10`, Bold `UthmanTN1B Ver10`), universeller Arabisch-Fließtext-Font.
- **KFGQPC Arabic Symbols 01 / Quran Symbols** (`Symbols1_Ver02`) — Sonderzeichen/Ornamente.
- **Qira'at-Varianten** (jeweils eigener Font, im Uthmani-Rasm der jeweiligen Lesart): Warsh (Ver10), Qaloon (Ver10), Doori/Douri (v09), Soosi (v09), Bazzi (v07), Qumbul/Qunbul (v07), Shouba/Shu'bah (v08). Ferner Basmalah, Shadatain (Shahadatain), ein „dotted"/„outlined" Naskh, HafsNastaleeq (Ver10) und die KSA-UI-Fonts.

**QCF (Quran Complex Font) — die seitenbasierten Glyph-Fonts:**

- **QCF V1** — laut QUL-Dokumentation „based on a digitized version of the Mushaf written by Uthman Taha and published in 1405H by Quran Printing complex". 604 Font-Dateien (eine je Mushaf-Seite, 15 Zeilen/Seite).
- **QCF V2** — laut QUL „Uthman Taha wrote another copy published around 1423H by Quran Printing complex, and QCF v2 is the font based on this print" (oft 2013 datiert). 604 Font-Dateien (`QCF_P001`–`QCF_P604`) plus `QCF_BSML` (Ligatur-/Symbolfont für Versnummern). Die meistgenutzte Variante (Quran.com „mushaf=1", empfohlen).
- **QCF V4** — laut GitHub `MohamadHajjRabee/quran-qcf4`: „a new … Quranic font based on the Madinah Mushaf (1441 AH), written by the calligrapher Uthman Taha … an improved and modern edition of the second Madinah font (QCF2, 2013)" mit **eingebetteter Tajweed-Färbung**. Dabei „Reduced font file count to just 47 files (down from 604 in QCF1/QCF2)", plus `QCF4_QBSML`. Auf Quran.com als „mushaf=19".

#### 1.2 Amiri und Amiri Quran (Khaled Hosny / Alif Type)

- **Amiri** — klassischer Naskh-Font, Wiederbelebung der Bulaq-Press-/Amiria-Schrift (Kairo, ab 1905). Diese Schrift wurde für die „Kairoer Ausgabe" (Cairo edition) des Korans verwendet — eine standardisierte Druckausgabe, publiziert am **10. Juli 1924** durch die Amiri Press im Bulaq-Viertel Kairos unter Aufsicht der al-Azhar-Gelehrten (das Projekt umfasste ca. 17 Jahre wissenschaftlicher Arbeit). Amiri hat vier Schnitte (Regular, Bold, Italic/Slanted, Bold Italic), **über 6000 Glyphen** und deckt laut Wikipedia die Blöcke U+0600–U+06FF (Arabic) und U+0750–U+077F (Arabic Supplement) ab. Lizenz: **OFL**. Aktuelle Version **1.003 vom 19. November 2024**; laut GitHub `aliftype/amiri` wurde Amiri „actively developed between 2008–2022, when version 1 was released and it was then considered mature enough that no further development is planned" — also die finale Version.
- **Amiri Quran** — schlankere Subset-Variante speziell für Quran-Satz (Naskh, für lange Textblöcke optimiert, gut lesbar auch bei kleinen Größen); die Regular-Variante umfasst ca. 1983 Glyphen (Subset gegenüber den 6000+ der Vollversion).
- **Amiri Quran Colored** — Variante mit farbigen Glyphen (Tajweed-artige Farbmarkierungen) über COLR/CPAL-Farbfont-Technik. Bezug: Google Fonts, GitHub `aliftype/amiri`, CTAN (`AmiriQuran.ttf`, `AmiriQuranColored.ttf`). Besonderheiten laut Changelog: umfangreiche Unterstützung Quranischer Annotationszeichen, kurvenförmige Kashida (ss07 zum Deaktivieren), korrekte Mark-Positionierung, mehrfache Bugfixes für Farbglyphen.

#### 1.3 SIL-Fonts: Scheherazade New, Harmattan, Lateef, Awami Nastaliq

Alle von SIL International, alle **OFL**, Bezug: `software.sil.org/arabicfonts/`.
- **Scheherazade New** — traditioneller Naskh-Font, deckt das gesamte Unicode-Arabisch-Repertoire ab (bis Unicode 14.0), zwei Schnitte (Regular, Bold). Unterstützt sowohl OpenType als auch Graphite. Bietet nur eine „vereinfachte" Wiedergabe (Basis-Verbindungsglyphen, nur die nötigen Lam-Alef-Ligaturen). Ideal als vokalisierter Fließtext- und Quran-Font. Von Tanzil offiziell empfohlen.
- **Lateef** — Naskh-Stil, für Sindhi und südasiatische Sprachen.
- **Harmattan** — für westafrikanische Sprachen im arabischen Schriftsystem.
- **Awami Nastaliq** — Nastaliq-Stil für Sprachen Pakistans (u. a. Urdu). Nutzt Graphite-Technologie (in LaTeX: `\newfontfamily\urdufont[Renderer=Graphite]{Awami Nastaliq}`).
- Weitere: Alkalami, Ruwudu (Rubutun-Kano für Nigeria/Niger).

#### 1.4 Noto-Fonts (Google)

- **Noto Naskh Arabic** — modulierter „Serif"-Naskh, gut für Fließtext; unterstützt Diakritika mit sauberer Mark-Positionierung; von Community-Quellen für Bismillah-Diakritika (inkl. U+FDFD ﷽) empfohlen. Vier Achsen (Regular/Medium/SemiBold/Bold).
- **Noto Nastaliq Urdu** — Nastaliq-Stil, geeignet für Urdu/Indopak-nahe Darstellung. Alle OFL.
- **Noto Kufi Arabic** — starke Quran-/Diakritika-Unterstützung laut Community-Repos.

#### 1.5 Indopak-Fonts (südasiatischer Raum)

- **PDMS Saleem Quran Font** (Pakistan Data Management Services, seit 2007) — hochwertiger OpenType-Font nach pakistanischer Quran-Kalligrafie (Stil Yameen Dehlvi / Mohammed Saleem). Volle Aeraab-/Mark-Positionierung, alle Waqf-Zeichen. Nastaliq-Einflüsse. Von Tanzil empfohlen.
- **Al Qalam Quran Majeed** — verbreiteter Indopak-Font.
- **me_quran** (Meor Ridzuan) — beliebter freier Uthmani-Font, u. a. in LaTeX-Quran-Setups genutzt; von Tanzil gelistet.
- **IndoPak Nastaleeq** (Quran.com/QuranWBW) — verfeinerte Version des Standard-Indopak-Skripts, näher am authentischen Indopak-Mushaf; als `indopak-nastaleeq-waqf-lazim` über die Quran-Foundation-CDN. Verfügbar in 9/13/15/16-zeiligen Mushaf-Layouts.

#### 1.6 DigitalKhatt (offen, dynamisch)

Ein Open-Source-Projekt (gesponsert von Tarteel AI) mit einem **parametrischen, variablen Font** (MetaFont-inspiriert), der Arabisch dynamisch justiert (kurvenförmige Buchstabendehnung statt gerader Kashida). „Digital Khatt V2" entspricht dem 1420 H Madani-Mushaf im Uthmani-Rasm. Erweitert OpenType/HarfBuzz für Arabische Justierung; nutzbar in LuaLaTeX. Bezug: `digitalkhatt.org`, GitHub `DigitalKhatt/`.

#### 1.7 Weitere/kommerzielle Fonts

- **Traditional Arabic**, **Sakkal Majalla** — mit Windows mitgeliefert (Microsoft/Sakkal), proprietär; als Fallback brauchbar, aber Quran-Diakritika teils suboptimal.
- **KacstQuran** — freier Font (Teil der KACST-Fonts), einfache Qualität.
- **Kitab, Qalam, Thabit** — kleinere freie Arabisch-Fonts; für Quran-Diakritika nur bedingt geeignet.
- **Linotype/Monotype Arabic** (z. B. Monotype Naskh) — kommerziell, kostenpflichtige Lizenz.

### 2. Technische Grundlagen und Fallstricke

#### 2.1 Unicode-basiert vs. seitenbasiert/glyph-basiert

Dies ist die zentrale technische Unterscheidung:
- **Unicode-basierte Fonts** (z. B. KFGQPC Uthmanic Hafs, Amiri Quran, Scheherazade New): Der Text ist als normaler Unicode gespeichert; der Font rendert die korrekten Formen über OpenType. Vorteile: durchsuchbar, kopierbar, ein Font für den gesamten Koran, einfach zu implementieren. Quran.com-API-Feld: `text_qpc_hafs`, `text_uthmani`, `text_indopak`.
- **Seitenbasierte/glyph-basierte Fonts (QCF)**: Jede Mushaf-Seite hat eine eigene Font-Datei; jedes Wort ist ein einzelner Glyph, adressiert über einen privaten Codepoint (Private Use Area). Vorteil: **pixelgenaue Seitentreue** zum gedruckten Medina-Mushaf (Zeilenumbrüche, Seitenumbrüche identisch). Nachteile: **kein Copy-Paste, keine Textsuche**, 604 Dateien zu laden, und die Codes müssen in HTML per `innerHTML` (nicht `textContent`) gesetzt werden. Quran.com-API-Felder: `code_v1`, `code_v2`.

Die Quran-Foundation-Dokumentation liefert einen expliziten Entscheidungsbaum (verbatim): „Quickest Setup (Simple apps) → Use QPC Hafs (Unicode); Physical Mushaf Layout → Use QCF V2 (Glyph-based); Tajweed Colors (Learning) → Use QCF V4". Zusätzlich die Warnung: Vers-End-Marker („end") stets mit dem Unicode-Font (UthmanicHafs), nicht mit QCF, rendern.

#### 2.2 Uthmani- vs. Imlaei-/Simple-Rasm

- **Uthmani-Rasm** (auch „Madani"): historische Rechtschreibung des Uthman-Kodex, mit zusätzlichen kleinen Zeichen (kleines Alif, kleine Waw/Ya, etc.). Fonts: KFGQPC Uthmanic Hafs, QCF, Amiri Quran, Digital Khatt.
- **Imlaei/Simple** („Imla'i", moderne Rechtschreibung): näher an moderner Standardorthografie, ohne viele der kleinen Uthmani-Zeichen — leichter für Nicht-Araber/Lernende und generische Fonts. Tanzil bietet beide Text-Streams getrennt an.
- **Indopak-Rasm**: südasiatische Konvention mit expliziterer Vokalisierung (Dabt) als Madani; eigener Nastaliq-/Naskh-Stil.

Wichtig: Der Rasm steckt sowohl im **Text** als auch im **Font**. Ein Uthmani-Font mit Imlaei-Text (oder umgekehrt) führt zu falscher/unschöner Darstellung.

#### 2.3 Unicode-Bereiche für Quran-Zeichen

Vollständige Quran-Darstellung erfordert Zeichen aus mehreren Blöcken:
- **Arabic** (U+0600–U+06FF): enthält im Unterblock „Quranic annotation signs" u. a. U+06D6–U+06ED (kleine hochgestellte Ligaturen wie Sad-Lam-Alef-Maksura U+06D6, Waqf-Zeichen), U+06DD (Ende-des-Verses ۝ / Ayah-Marker), U+06DE (Rub el Hizb ۞), U+06DF (kleine runde Null / al-sifr al-mustadir), U+06E0 (kleine rechteckige Null), U+06E9 (Sajdah-Zeichen).
- **Arabic Presentation Forms-A/B** (U+FB50–U+FDFF, U+FE70–U+FEFF): u. a. das Einzelzeichen-Bismillah U+FDFD (﷽) — nicht alle Fonts enthalten es.
- **Arabic Extended-A** (U+08A0–U+08FF): weitere Quranische Annotationszeichen und Buchstabenvarianten (bis Unicode 16.0 voll belegt), z. B. U+08DB „Arabic Small High Word As-Sajda" (Unicode 9.0, 2016).
- **Arabic Extended-B** (U+0870–U+089F): kodiert Quranische Annotationen und Buchstabenvarianten für nicht-arabische Sprachen (seit Unicode 14.0/2021).

Fonts mit weitgehend vollständiger Abdeckung: Amiri/Amiri Quran (deckt „essentiell jedes Arabisch-Unicode-Zeichen" ab), Scheherazade New (gesamtes Unicode-Arabisch bis 14.0), KFGQPC-Fonts (für Quran-Zeichen), Noto Naskh Arabic.

#### 2.4 OpenType, Ligaturen, Mark-Positionierung, Rendering-Engines

- Korrekte Darstellung erfordert OpenType-Features (`init/medi/fina/isol`, `mark`/`mkmk` für Diakritika-Positionierung, `ccmp`, `liga`, Stylistic Sets). Fehlt die Mark-to-Base-/Mark-to-Mark-Positionierung, „schweben" Tashkeel-Zeichen falsch oder sitzen über dem falschen Buchstaben — ein häufiges Problem bei minderwertigen oder generischen Fonts.
- **Rendering-Engines**: HarfBuzz (Linux, Chrome, Firefox, LibreOffice, XeTeX/LuaTeX), DirectWrite (Windows), CoreText (macOS/iOS). Unterschiede führen zu inkonsistenter Darstellung.
- **Konkreter HarfBuzz-Bug** (Issue #501, eröffnet von ebraminio am 23. Juni 2017): Die Versnummern des „KFGQPC Uthmanic Script HAFS" werden mit HarfBuzz falsch geshaped — `./hb-view UthmanicHafs1 Ver09.otf --direction=ltr ١٢` ergibt „Actual: 21 / Expected: 12"; mit CoreText (`--shapers=coretext` auf macOS) korrekt. Deshalb rät die Quran-Foundation, Vers-End-Marker stets mit dem Unicode-Font statt QCF zu rendern.
- **Firefox-QCF-V1-Bug**: zu enger Wortabstand bei kleinen Schriftgrößen — Workaround via `word-spacing`/`margin-inline-end`.
- Ältere Amiri-Versionen brauchten einen „zero-width Kashida hack" für LibreOffice < 7.5; ab Amiri 0.900 / LibreOffice ≥ 7.5 nicht mehr nötig.

#### 2.5 Farbige Tajweed-Darstellung

Zwei Farbfont-Techniken:
- **COLR/CPAL** (COLRv0/COLRv1): Farbschichten im Font, Farbpalette per CSS `font-palette` umschaltbar (Light/Dark/Sepia). Genutzt von Amiri Quran Colored und QCF V4 (COLRv1). Unterstützt in Chrome, Edge, Safari.
- **OT-SVG**: eingebettete SVG-Glyphen mit fest „eingebackenen" Farben. Firefox unterstützt für Dark Mode nur OT-SVG (getrennte Font-Dateien je Theme), da es COLRv1-`font-palette` hier anders handhabt.

Für Anki: COLR/CPAL-Farbfonts funktionieren, sofern die WebView/Qt-Version modern genug ist; auf älteren AnkiDroid-/iOS-WebViews kann die Farbe fehlen (Fallback auf Schwarz). Amiri Quran Colored ist der pragmatischste Weg zu farbigem Tajweed in Anki, weil es ein einzelner Unicode-Font ist.

### 3. Lizenzen

| Lizenztyp | Fonts | Bedeutung für Einbettung |
|---|---|---|
| **OFL (frei, modifizierbar, kommerziell nutzbar)** | Amiri, Amiri Quran, Amiri Quran Colored; Scheherazade New; Lateef; Harmattan; Awami Nastaliq; Noto Naskh/Nastaliq/Kufi Arabic; KacstQuran | Uneingeschränkt einbettbar (auch in kommerzielle Projekte), Modifikation erlaubt (Namensänderung bei Ableitungen beachten). |
| **KFGQPC-EULA (kostenlos, aber restriktiv)** | KFGQPC Uthmanic Hafs, Uthman Taha Naskh, QCF V1/V2/V4, Qira'at-Fonts | „Free of Cost" zur Nutzung/Kopie/Distribution, aber: **darf nicht verkauft, modifiziert, verändert, übersetzt, reverse-engineered werden.** Einbettung zur reinen Darstellung ist erlaubt; Modifikation/Sublizenzierung nicht. |
| **LPPL** | LaTeX-Pakete `quran`, `quran-en` | Freie Software-Lizenz für den Paketcode (nicht die Fonts). |
| **Kommerziell** | Linotype/Monotype Arabic (z. B. Monotype Naskh), Sakkal Majalla, Traditional Arabic (mit Windows gebündelt) | Kostenpflichtige Lizenz bzw. an Betriebssystem gebunden; nicht frei weiterverteilbar. |

**Die KFGQPC-EULA im Wortlaut** (aus dem Copyright-Feld des Fonts): „Permission is hereby granted, Free of Cost, … the rights to Use, Copy, Distribute, subject to the following conditions: 1. The Font Software cannot be Sold, Modified, Altered, Translated, Reverse Engineered, Decompiled, Disassembled, Reproduced …". Copyright (c) 2010, ISBN 978-603-8010-15-0, Accession No. 1430/7278.

**Wichtiger Lizenz-Widerspruch (zu beachten):** Es gibt de facto zwei KFGQPC-Lizenztexte. Der restriktive EULA-Text steckt im Font-Binary (2010). Die offizielle Copyright-Webseite (`dm.qurancomplex.gov.sa/copyright-2/`) ist deutlich permissiver und erlaubt die freie Nutzung „in all personal, individual businesses, … governmental departments, … private and national institutions, … websites, software" — mit Einschränkungen nur beim kommerziellen *Druck* des Korans (Royal Decree No. 136/8, 1/2/1406 AH; Royal Decree No. 9/B/46356, 28/9/1424 AH). Für die Font-Nutzung im engeren Sinn sollte man im Zweifel den restriktiveren EULA-Text beachten bzw. bei kommerzieller Modifikation eine schriftliche Genehmigung einholen.

### 4. Praktische Einsatzbereiche und Empfehlungen

#### 4.1 Anki / Spaced Repetition (Hifz)

- **Font-Einbettung**: Font muss `.ttf` sein (offiziell werden in Anki/AnkiDroid nur TrueType-Fonts unterstützt). Datei mit führendem Unterstrich in den `collection.media`-Ordner legen (z. B. `_uthmanichafs.ttf`) — der Unterstrich verhindert, dass Anki sie als „ungenutzt" löscht. Dann im Karten-Styling:
  ```css
  @font-face { font-family: quranfont; src: url("_uthmanichafs.ttf"); }
  .card { font-family: quranfont; direction: rtl; }
  ```
- **AnkiDroid/iOS**: Die Media-Folder-Methode ist plattformübergreifend am robustesten (synchronisiert via AnkiWeb). Die separate „Default font"-Einstellung in AnkiDroid ist veraltet und funktioniert unter Android 10+ (Scoped Storage) oft nicht — daher immer die `_font.ttf`-Media-Methode nutzen. AnkiDroid lädt den ganzen Font in den Speicher; große Fonts können langsam sein.
- **Seitentreuer Hifz-Ansatz**: Für Memorierung nach dem Medina-Mushaf gibt es fertige Anki-Decks („The Holy Quran – Medina Font", 604 Karten, je Seite eine Karte). Wer Wort-für-Wort/Vers-für-Vers lernt, nutzt besser den Unicode-Font mit Tanzil-/QUL-Text.
- **Empfehlung**: KFGQPC Uthmanic Hafs (Unicode) für flexible Karten; Amiri Quran Colored für farbiges Tajweed; QCF-Seitenfonts nur, wenn exakte Seitentreue gewünscht ist (aufwendig wegen 604 Dateien + Glyphcodes).

#### 4.2 LaTeX

- **Engine**: XeLaTeX oder LuaLaTeX (nicht pdfLaTeX), wegen Unicode + OpenType + RTL.
- **Pakete**: `polyglossia` + `fontspec` + `bidi` (Standard), oder `arabxetex` (XeLaTeX, ArabTeX-Eingabe) bzw. `arabluatex` (LuaLaTeX). `arabxetex` und `arabluatex` nutzen standardmäßig **Amiri**.
- **`quran`-Paket** (Autor Seiied-Mohammad-Javad Razavian, LPPL v1.3c+; laut CTAN aktuell **v2.42, Release 2026/03/12**, Copyright © 2015–2026): Makros `\quransurah`, `\quranayah`, `\quranjuz`, `\basmalah` etc.; Optionen `uthmani`, `wordwise`, `trans={de,en,fa,fr}`. Der Text kommt aus einer eingebauten Unicode-Datenbank (auf Tanzil basierend). Erweiterung `quran-en` für 16+ englische Übersetzungen (ebenfalls Tanzil-basiert).
  ```latex
  \usepackage{quran}
  \usepackage{polyglossia}\setotherlanguage{arabic}
  \usepackage{fontspec}\setmainfont{Amiri}  % oder Scheherazade New
  \usepackage{bidi}
  \begin{document}\setRTL\textarabic{\quransurah[112]}\end{document}
  ```
- **Font-Wahl in LaTeX**: Amiri und Scheherazade New funktionieren am besten (beide OFL, in TeX Live enthalten). Graphite-Fonts (Awami Nastaliq) brauchen `[Renderer=Graphite]` und XeLaTeX. Für Kashida-Justierung: `babel` mit `justification=kashida` + Scheherazade New. Für dynamische Justierung: DigitalKhatt-Font mit LuaLaTeX (siehe TUGboat 2021).

#### 4.3 Typst

- Typst unterstützt RTL/Arabisch grundsätzlich über `#set text(lang: "ar", dir: rtl)` und nutzt intern rustybuzz (HarfBuzz-Port) fürs Shaping — Diakritika/Ligaturen funktionieren mit guten OpenType-Fonts (Amiri, Scheherazade New, Noto Naskh Arabic).
- Es fehlt jedoch die ausgereifte Automatik/BiDi-Komfortschicht von LaTeX; man muss Richtung/Sprache oft manuell setzen. Das Community-Paket **`auto-bidi`** (Typst Universe) automatisiert die Richtungs- und Spracherkennung (Erst-Zeichen-Heuristik wie in Obsidian/WhatsApp) für gemischte Dokumente.
- Fonts müssen als Datei vorliegen (`--font-path` bzw. im Projekt); OFL-Fonts sind hier unkompliziert. Für seitentreue QCF-Fonts ist Typst nicht praktikabel (Glyphcode-Handling).

#### 4.4 Web

- **@font-face + woff2**: Unicode-Fonts (Uthmanic Hafs, Amiri Quran) als einzelne woff2-Datei einbinden; `direction: rtl`. woff2-Konvertierung z. B. via `fonttools` (`ttx --flavor woff2`).
- **Quran.com/Quran-Foundation-Ansatz**: QCF-Seitenfonts werden dynamisch pro sichtbarer Seite via `FontFace`-API nachgeladen (nicht alle 604 auf einmal), Glyphcodes per `innerHTML`. Farbiges Tajweed (V4) über `font-palette` (COLRv1) bzw. OT-SVG (Firefox Dark). Die Foundation rät ausdrücklich davon ab, Font-/Textdateien lokal zu speichern (Korrekturen/Updates), und empfiehlt Laden von ihrer CDN (`verses.quran.foundation`).
- **npm/Repos**: `nuqayah/qpc-fonts` (mit @font-face-Rezepten), `thetruetruth/quran-data-kfgqpc` (Text + Font + fertige CSS via jsDelivr-CDN), `mustafa0x/qpc-fonts`. Vergleichs-/Download-Hub: `fonts.quran.ws` (27 Fonts, 28 Text-Editionen, 12 Mushaf-Layouts, mit Font↔Text-Paarungsregeln) und QUL von Tarteel (`qul.tarteel.ai`).

#### 4.5 Print/Desktop-Publishing

- **InDesign**: „World-Ready Composer" (bzw. das ME/Arabic-Release) für RTL/Arabisch aktivieren. Amiri/Scheherazade New funktionieren gut. Ältere Amiri-Versionen hatten Kashida-Probleme in InDesign (inzwischen behoben).
- **LibreOffice Writer**: RTL/CTL-Support aktivieren; das Add-on „Insert Qur'an Text" (QuranLOAddon) fügt Tanzil-Text ein und empfiehlt Scheherazade oder KFGQPC Uthmanic Hafs — „andere arabische Fonts liefern inkonsistente Ergebnisse".

#### 4.6 Maschinenlesbare Quran-Texte — und die Font↔Text-Paarungsregel

Zentrale Warnung: **Text-Edition und Font müssen zueinander passen.**
- **Tanzil.net** — die reine „Purist"-Archiv-Quelle; bietet getrennte Uthmani- und Imla'i-Streams (Uthmani-Version z. B. 1.0.2). Passt zu Unicode-Fonts (Scheherazade, KFGQPC Uthmanic Hafs). Tanzil-Uthmani ≠ KFGQPC-Text im Detail (kleine orthografische/Mark-Unterschiede).
- **KFGQPC-Text** (aus dem techquran-Dev-Bereich, 8 Qira'at) — passt exakt zu den KFGQPC-Fonts der jeweiligen Lesart.
- **quran-json / QuranWBW / marwan/indopak-quran-text** — verschiedene JSON-Editionen; Indopak-Text nur mit Indopak-Font korrekt.
- **QCF-Glyphcodes** (`code_v1`/`code_v2`) — sind KEINE Unicode-Texte, sondern PUA-Codes, die NUR mit dem exakt passenden QCF-Seitenfont funktionieren.
- **QUL (Quranic Universal Library, Tarteel)** und **fonts.quran.ws** dokumentieren die Paarungsregeln und liefern 28 Text-Editionen als SQLite/JSON zusammen mit den passenden Fonts.

Wer Tanzil-Uthmani-Text mit einem QCF-Font (oder KFGQPC-Text mit einem generischen Font) kombiniert, bekommt fehlende Glyphen, falsch positionierte Marks oder leere Kästchen.

### 5. Community-Diskussionen und Vergleiche

- **GitHub**: `harfbuzz/harfbuzz#501` (Versnummer-Shaping-Bug bei KFGQPC Hafs); `aliftype/amiri` (Changelog/NEWS mit Details zu Quran-Zeichen, Kashida, Farb-Bugfixes); `nuqayah/qpc-fonts`, `thetruetruth/quran-data-kfgqpc`, `MohamadHajjRabee/quran-qcf4`, `DigitalKhatt/*`.
- **Quran-Foundation-Doku** (`api-docs.quran.foundation`) und **QUL-Doku** (`qul.tarteel.ai/docs/glyph-based`) sind die besten technischen Referenzen zur Font-Wahl.
- **Anki-Foren** (`forums.ankiweb.net`): geteilte Medina-Font-Decks für Hifz; Diskussionen zu `_font.ttf`-Einbettung und AnkiDroid-Font-Problemen.
- **TeX-Ökosystem**: CTAN `quran`, `arabxetex`, `arabluatex`; TUGboat-2021-Artikel zu DigitalKhatt-Justierung in LuaLaTeX.
- **Tanzil-Doku** (`tanzil.net/docs/quranic_fonts`) listet die von Tanzil empfohlenen Fonts: KFGQPC Hafs Uthmanic Script, KFGQPC Uthman Taha Naskh, Scheherazade, me_quran, PDMS Saleem Quran Font.

## Übersichtstabelle: Quran-Fonts im Vergleich

| Font | Stil | Rasm | Lizenz | Bezugsquelle | Eignung |
|---|---|---|---|---|---|
| **KFGQPC Uthmanic Script HAFS** (Ver09/Ver18/V22) | Naskh | Uthmani (Hafs) | KFGQPC-EULA (frei, nicht modifizierbar) | fonts.qurancomplex.gov.sa; nuqayah/qpc-fonts | Standard-Unicode-Font für Fließtext, Anki, Web, LaTeX-Fallback |
| **KFGQPC HAFS Smart** (v8) | Naskh | Uthmani (Hafs) | KFGQPC-EULA | thetruetruth/quran-data-kfgqpc | Vers-Snippets auf Smart-Devices (nicht seitentreu) |
| **QCF V1 / V2** | Naskh (Uthman Taha) | Uthmani, seitenbasiert | KFGQPC-EULA | qurancomplex.gov.sa/TTF; quran.foundation CDN | Pixelgenaue Medina-Mushaf-Seiten (604 Dateien, kein Copy-Paste) |
| **QCF V4** | Naskh + Tajweed-Farbe | Uthmani, seitenbasiert | KFGQPC-EULA | quran.foundation CDN | Seitentreu + farbiges Tajweed (47 Dateien, COLRv1/OT-SVG) |
| **Amiri Quran** | Naskh (Bulaq) | Uthmani-tauglich | OFL | fonts.google.com; aliftype/amiri; CTAN | Bester frei lizenzierter Quran-Naskh; LaTeX-Standard |
| **Amiri Quran Colored** | Naskh + Farbe | Uthmani-tauglich | OFL | aliftype/amiri; Google Fonts | Farbiges Tajweed (COLR/CPAL), Anki |
| **Scheherazade New** | Naskh | universell (Uthmani/Imlaei) | OFL | software.sil.org/arabicfonts | Vokalisierter Fließtext, LaTeX, LibreOffice; volle Unicode-Abdeckung |
| **Lateef** | Naskh | universell | OFL | SIL | Sindhi/südasiatisch |
| **Awami Nastaliq** | Nastaliq | Indopak-nah | OFL | SIL | Urdu/Indopak (Graphite) |
| **Noto Naskh Arabic** | Naskh (Serif) | universell | OFL | Google Fonts | Web/UI, saubere Mark-Positionierung |
| **Noto Nastaliq Urdu** | Nastaliq | Indopak-nah | OFL | Google Fonts | Urdu/Indopak-Darstellung |
| **PDMS Saleem Quran** | Naskh/Nastaliq | Indopak | frei (personal use) | pakdata.com | Indopak-Mushaf, volle Waqf-/Aeraab-Zeichen |
| **Al Qalam Quran Majeed** | Nastaliq | Indopak | frei | archive.org | Indopak-Text |
| **me_quran** | Naskh | Uthmani | frei | Tanzil/arabicfonts | Freier Uthmani-Font, LaTeX |
| **Digital Khatt V2** | Naskh (parametrisch/variabel) | Uthmani (1420 H) | Open Source | digitalkhatt.org; GitHub | Dynamische Justierung, LuaLaTeX, Forschung |
| **KacstQuran** | Naskh | Uthmani | GPL/frei | KACST | einfacher freier Font |
| **Traditional Arabic / Sakkal Majalla** | Naskh | – | proprietär (Windows) | Microsoft | Fallback, Quran-Diakritika suboptimal |
| **Monotype/Linotype Arabic** | diverse | – | kommerziell | Monotype | professioneller Satz (kostenpflichtig) |

## Recommendations

**Stufe 1 — Sofort loslegen (Anki-Hifz, einfache Dokumente):**
- Für flexible Karten/Fließtext: **KFGQPC Uthmanic Script HAFS** (aktuelle Version V22 bzw. Ver18) als `_uthmanichafs.ttf` in den Anki-media-Ordner, mit `direction: rtl`. Text von **Tanzil (Uthmani)** oder QUL beziehen.
- Wenn OFL/Rechtssicherheit wichtig ist (z. B. Weitergabe der Decks): **Amiri Quran** oder **Scheherazade New** statt KFGQPC.

**Stufe 2 — Farbiges Tajweed / seitentreues Hifz:**
- Farbiges Tajweed in Anki/Web: **Amiri Quran Colored** (einzelner OFL-Font, COLR/CPAL) — einfachster Weg. Alternativ **QCF V4** für den Medina-Look, aber mit 47-Dateien-Handling.
- Seitentreues Medina-Mushaf-Hifz: fertiges **„Medina Font"-Anki-Deck** (604 Seiten) oder QCF-V2-Seitenfonts nachbauen.

**Stufe 3 — Publikationen (LaTeX/Typst/Print):**
- LaTeX: XeLaTeX/LuaLaTeX + `quran`-Paket + `polyglossia`/`fontspec`/`bidi`, Font **Amiri** oder **Scheherazade New**.
- Typst: `#set text(lang:"ar", dir:rtl)` + Paket **auto-bidi**, Font **Amiri**/**Scheherazade New**.
- Print/InDesign: World-Ready Composer + Amiri/Scheherazade New.

**Benchmarks/Schwellen, die die Empfehlung ändern:**
- Wird **exakte Seitentreue** zum gedruckten Medina-Mushaf gebraucht (Hifz nach Seiten) → QCF-Seitenfonts trotz Komplexität.
- Wird **Modifikation/kommerzielle Einbettung** benötigt → nur OFL-Fonts (KFGQPC ausgeschlossen ohne schriftliche Genehmigung).
- Wird **Indopak-Konvention** gebraucht (südasiatische Nutzer) → PDMS Saleem / Noto Nastaliq Urdu / IndoPak Nastaleeq + passender Indopak-Text.
- Treten **falsch positionierte Diakritika** auf → Font/Engine wechseln (Amiri, Scheherazade New, Noto Naskh) und XeLaTeX/LuaLaTeX bzw. moderne WebView sicherstellen.

## Caveats
- **Font↔Text-Paarung**: Die häufigste Fehlerquelle. Tanzil-Uthmani, KFGQPC-Text, Indopak-Text und QCF-Glyphcodes sind NICHT austauschbar. Immer die zum Font gehörende Text-Edition verwenden.
- **KFGQPC-Lizenz-Widerspruch**: Font-EULA (restriktiv, „keine Modifikation") vs. permissivere Website-Copyright-Seite. Im Zweifel restriktiv auslegen; bei kommerzieller Modifikation schriftliche Genehmigung des KFGQPC einholen.
- **Versionswirrwarr bei KFGQPC**: „Ver09", „Ver18"/„0.18", „V22" bezeichnen dieselbe Font-Linie in verschiedenen Schemata; V22 (2024) ist die neueste. Drittanbieter-Mirror (font.download, fontspace, onlinewebfonts) sind NICHT offiziell — für Produktivnutzung von der offiziellen KFGQPC-Seite bzw. Quran-Foundation-CDN beziehen, da Texte/Fonts periodisch korrigiert werden.
- **Rendering-Bugs**: HarfBuzz-Versnummer-Shaping (KFGQPC), Firefox-QCF-V1-Abstände, Farbfont-Unterschiede (COLRv1 vs. OT-SVG) je nach Browser/WebView — vor Produktivnutzung mit echten Quran-Passagen (inkl. komplexer Diakritika-Kombinationen) testen, nicht mit generischem Arabisch.
- **Typst** ist beim Arabisch-/RTL-Satz noch weniger ausgereift als LaTeX; für anspruchsvollen Quran-Satz ist XeLaTeX/LuaLaTeX derzeit zuverlässiger.
- Die genaue Glyphenabdeckung einzelner Fonts für die neuesten Unicode-Blöcke (Arabic Extended-B, seit 2021) variiert; bei exotischen Annotationszeichen die Font-Charmap prüfen.