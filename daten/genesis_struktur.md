# Aufbau erkundeter GENESIS-Tabellen

## BY-E12.1i (bildung)

**Titel:** E12.1: Neu eingetretene Schülerinnen und Schüler an beruflichen Schulen nach Schularten

Regionalvariable: `Standard (nur Aufbau, keine Kreise)` · Zeilen: 1170 · Jahre: 2023, 2024

Hinweise beim Abruf:
- Tabelle BY-E12.1i: keine Regionalebene mit den Kreisen gefunden (versucht: BY-KRE, KREISE, KRS, KREIS; KREISE: nur 0 von 96 Gebieten; KRS: nur 0 von 96 Gebieten; KREIS: nur 0 von 96 Gebieten)

- Merkmal 1: **Kreise, kreisfreie Städte und Land** (Region, 0 Kreise)
- Merkmal 2: **Abschlussarten an allgemeinbildenden Schulen** (15 Ausprägungen): Hauptschulabschluss; ohne Hauptschulabschluss; Fachhochschulreife; mittlerer Schulabschluss; Sonstiger Abschluss; Hochschulreife; Berufsoberschulen; Insgesamt; Berufsfachschulen des Gesundheitswesens; Fachoberschulen; Berufsschulen zur sonderpädagogischen Förderung; Fachschulen; Fachakademien; Berufsfachschulen; Berufsschulen
- Merkmal 3: **Schulart (beruflich)** (13 Ausprägungen): Insgesamt; Fachakademien; Fachschulen; Berufsschulen zur sonderpädagogischen Förderung; Berufsschulen; Berufsoberschulen; Berufsfachschulen des Gesundheitswesens; Fachoberschulen; Berufsfachschulen; Deutsche; Ausländer; Weiblich; Männlich
- Merkmal 4: **Geschlecht und Nationalität** (6 Ausprägungen): Insgesamt; Deutsche; Ausländer; Männlich; Weiblich; 

Wertspalten (mit Zahl belegter Zeilen):
- `BY-W05__Neu eingetretene Schülerinnen und Schüler__Anzahl` (581)
- `None__None__%` (491)

Beispiel Bamberg (Stadt):

```
```

## BY-E15.1i (bildung)

**Titel:** E15.1: An beruflichen Schulen erworbene allgemeinbildende Schulabschlüsse

Regionalvariable: `BY-KRE` · Zeilen: 87300 · Jahre: 2022, 2024

- Merkmal 1: **Kreise, kreisfreie Städte und Land** (Region, 96 Kreise)
- Merkmal 2: **Schulart (beruflich)** (14 Ausprägungen): Berufsfachschulen; Fachakademien; Fachschulen; Berufsschulen zur sonderpädagogischen Förderung; Wirtschaftsschulen; Fachoberschulen; Berufsfachschulen des Gesundheitswesens; Berufsoberschulen; Insgesamt; Berufsschulen; Hauptschulabschluss; Hochschulreife; mittlerer Schulabschluss; Fachhochschulreife
- Merkmal 3: **Geschlecht und Nationalität** (14 Ausprägungen): Deutsche; Insgesamt; Weiblich; Ausländer; Männlich; Berufsfachschulen; Wirtschaftsschulen; Berufsschulen zur sonderpädagogischen Förderung; Fachakademien; Berufsfachschulen des Gesundheitswesens; Berufsschulen; Fachschulen; Berufsoberschulen; Fachoberschulen
- Merkmal 4: **** (6 Ausprägungen): ; Ausländer; Weiblich; Männlich; Deutsche; Insgesamt

Wertspalten (mit Zahl belegter Zeilen):
- `BY-W11__Allgemeinb. Schulabschlüsse an beruflichen Schulen__Anzahl` (14205)
- `None__None__%` (9655)

Beispiel Bamberg (Stadt):

```
{"Zeit": "2022-P1Y", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Berufsoberschulen", "3_Auspraegung_Label": "Insgesamt", "4_Auspraegung_Label": "", "BY-W11__Allgemeinb. Schulabschlüsse an beruflichen Schulen__Anzahl": "78"}
{"Zeit": "2022-P1Y", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Insgesamt", "3_Auspraegung_Label": "Deutsche", "4_Auspraegung_Label": "", "BY-W11__Allgemeinb. Schulabschlüsse an beruflichen Schulen__Anzahl": "417"}
{"Zeit": "2022-P1Y", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Berufsoberschulen", "3_Auspraegung_Label": "Deutsche", "4_Auspraegung_Label": "", "BY-W11__Allgemeinb. Schulabschlüsse an beruflichen Schulen__Anzahl": "78"}
{"Zeit": "2022-P1Y", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Fachschulen", "3_Auspraegung_Label": "Deutsche", "4_Auspraegung_Label": "", "BY-W11__Allgemeinb. Schulabschlüsse an beruflichen Schulen__Anzahl": "12"}
{"Zeit": "2022-P1Y", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Berufsschulen zur sonderpädagogischen Förderung", "3_Auspraegung_Label": "Insgesamt", "4_Auspraegung_Label": "", "BY-W11__Allgemeinb. Schulabschlüsse an beruflichen Schulen__Anzahl": "-"}
{"Zeit": "2022-P1Y", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Fachoberschulen", "3_Auspraegung_Label": "Deutsche", "4_Auspraegung_Label": "", "BY-W11__Allgemeinb. Schulabschlüsse an beruflichen Schulen__Anzahl": "185"}
```

## BY-A01.2i (bildung)

**Titel:** A1.2: Bevölkerung nach Geschlecht und Alter

Regionalvariable: `BY-KRE` · Zeilen: 31428 · Jahre: 2022, 2023, 2024

- Merkmal 1: **Kreise, kreisfreie Städte und Land** (Region, 96 Kreise)
- Merkmal 2: **Geschlecht** (3 Ausprägungen): Männlich; Insgesamt; Weiblich
- Merkmal 3: **Altersgruppen (unter 3 bis 75 u. m.)** (18 Ausprägungen): 75 Jahre und mehr; 10 bis unter 15 Jahre; 25 bis unter 30 Jahre; 18 bis unter 20 Jahre; 15 bis unter 18 Jahre; 55 bis unter 60 Jahre; 6 bis unter 10 Jahre; 65 bis unter 75 Jahre; 45 bis unter 50 Jahre; 35 bis unter 40 Jahre; 20 bis unter 25 Jahre; 30 bis unter 35 Jahre; unter 3 Jahre; 50 bis unter 55 Jahre; Insgesamt; 40 bis unter 45 Jahre; 3 bis unter 6 Jahre; 60 bis unter 65 Jahre

Wertspalten (mit Zahl belegter Zeilen):
- `None__None__%` (15714)
- `BEVSTD__Bevölkerung__Anzahl` (15714)

Beispiel Bamberg (Stadt):

```
{"Zeit": "2022-12-31", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Männlich", "3_Auspraegung_Label": "25 bis unter 30 Jahre", "None__None__%": "9,5"}
{"Zeit": "2022-12-31", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Männlich", "3_Auspraegung_Label": "25 bis unter 30 Jahre", "BEVSTD__Bevölkerung__Anzahl": "3441"}
{"Zeit": "2024-12-31", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Männlich", "3_Auspraegung_Label": "35 bis unter 40 Jahre", "None__None__%": "8,2"}
{"Zeit": "2024-12-31", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Männlich", "3_Auspraegung_Label": "35 bis unter 40 Jahre", "BEVSTD__Bevölkerung__Anzahl": "3113"}
{"Zeit": "2022-12-31", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Weiblich", "3_Auspraegung_Label": "60 bis unter 65 Jahre", "None__None__%": "6,7"}
{"Zeit": "2022-12-31", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Weiblich", "3_Auspraegung_Label": "60 bis unter 65 Jahre", "BEVSTD__Bevölkerung__Anzahl": "2531"}
```

## BY-A01.5i (bildung)

**Titel:** unbekannt

Regionalvariable: `BY-KRE` · Zeilen: 23571 · Jahre: 2022, 2023, 2024

- Merkmal 1: **Kreise, kreisfreie Städte und Land** (Region, 96 Kreise)
- Merkmal 2: **Altersgruppen (unter 18 bis 65 u. m.)** (9 Ausprägungen): 50 bis unter 65 Jahre; 18 bis unter 25 Jahre; 30 bis unter 50 Jahre; unter 18 Jahre; 65 Jahre und mehr; 25 bis unter 30 Jahre; Insgesamt; Deutsche; Ausländer
- Merkmal 3: **Geschlecht** (3 Ausprägungen): Insgesamt; Männlich; Weiblich

Wertspalten (mit Zahl belegter Zeilen):
- `BEVUEB__Überschuss der Zu- bzw. Fortzüge__Anzahl` (7857)
- `BEV085__Zuzüge über die Kreisgrenzen__Anzahl` (7857)
- `BEV086__Fortzüge über die Kreisgrenzen__Anzahl` (7857)

Beispiel Bamberg (Stadt):

```
{"Zeit": "2022", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "65 Jahre und mehr", "3_Auspraegung_Label": "Männlich", "BEVUEB__Überschuss der Zu- bzw. Fortzüge__Anzahl": "24"}
{"Zeit": "2022", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "Insgesamt", "3_Auspraegung_Label": "Insgesamt", "BEVUEB__Überschuss der Zu- bzw. Fortzüge__Anzahl": "2464"}
{"Zeit": "2022", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "25 bis unter 30 Jahre", "3_Auspraegung_Label": "Weiblich", "BEVUEB__Überschuss der Zu- bzw. Fortzüge__Anzahl": "-12"}
{"Zeit": "2022", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "18 bis unter 25 Jahre", "3_Auspraegung_Label": "Weiblich", "BEVUEB__Überschuss der Zu- bzw. Fortzüge__Anzahl": "446"}
{"Zeit": "2022", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "50 bis unter 65 Jahre", "3_Auspraegung_Label": "Männlich", "BEVUEB__Überschuss der Zu- bzw. Fortzüge__Anzahl": "92"}
{"Zeit": "2022", "1_Auspraegung_Label": "Bamberg", "2_Auspraegung_Label": "unter 18 Jahre", "3_Auspraegung_Label": "Weiblich", "BEVUEB__Überschuss der Zu- bzw. Fortzüge__Anzahl": "104"}
```
