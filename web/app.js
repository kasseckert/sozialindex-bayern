/* Sozialindex Bayern – Kartenanwendung mit Regionen (Aufsichtsbezirken)
   Benötigt: Leaflet 1.9, Chart.js 4 (beide lokal unter vendor/). */
(function () {
  "use strict";

  // ------------------------------------------------------------ Zustand
  const Z = {
    daten: null, kreise: null, gemeinden: null,
    ebene: "kreis", merkmal: "index", jahr: null,
    auswahl: null,            // ags des geöffneten Gebiets
    region: "bayern",         // "bayern" oder Region-ID aus konfiguration/gebiete.json
    massstab: "land",         // "land" = 100 ist Landesdurchschnitt, "region" = Regionsdurchschnitt
    geladen: new Set(),       // Regionen, deren Gemeindedaten geladen sind
    reiter: "profil",
  };
  const Karte = { map: null, flaechen: null, grenzen: null, layerNachAgs: new Map(), popup: null, diagramm: null,
    hoverRand: null, hoverAgs: null, hoverLayer: null, auswahlRand: null };
  // Geräte ohne Maus (Tablet, Handy): keine Hover-Effekte, ein Tippen öffnet das Popup.
  const mitMaus = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduziert = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const STUFEN = [85, 92, 97, 103, 108, 115];   // Klassengrenzen auf der 100er-Skala
  const DIM_KURZ = { arbeit: "Arbeit", demografie: "Demografie", bildung: "Bildung", versorgung: "Versorgung" };

  // ------------------------------------------------------------ Helfer
  const $ = (s) => document.querySelector(s);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const fmt = (wert, stellen = 1) =>
    wert == null || Number.isNaN(wert) ? "–"
      : new Intl.NumberFormat("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen }).format(wert);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function indikator(id) { return Z.daten.meta.indikatoren.find((i) => i.id === id); }
  function dimension(id) { return Z.daten.meta.dimensionen.find((d) => d.id === id); }

  function mitEinheit(wert, ind) {
    if (wert == null) return "–";
    const zahl = fmt(wert, ind.nachkommastellen ?? 1);
    if (ind.einheit === "%") return `${zahl} %`;
    if (ind.einheit === "€") return `${zahl} €`;
    if (!ind.einheit || /^je\s/.test(ind.einheit)) return zahl;   // „je 1.000 EW“ steht bereits im Namen
    return `${zahl} ${ind.einheit}`;
  }

  function anzeigeName(props, ebene) {
    if (ebene === "kreis") {
      return props.bez === "Landkreis" ? `Landkreis ${props.name}` : `${props.name} (Stadt)`;
    }
    return props.name;
  }
  function kreisVon(agsGemeinde) {
    return Z.kreise.features.find((f) => f.properties.ags === agsGemeinde.slice(0, 5))?.properties;
  }
  function unterzeile(props, ebene) {
    if (ebene === "kreis") return props.bez;
    const k = kreisVon(props.ags);
    if (props.ags.endsWith("000")) return "Kreisfreie Stadt";
    return `${props.bez}, ${k ? anzeigeName(k, "kreis") : ""}`;
  }

  function ebenenDaten() { return Z.daten[Z.ebene]; }
  function gebietDaten(ags, ebene = Z.ebene) { return Z.daten[ebene].gebiete[ags]; }

  // ------------------------------------------------------------ Regionen und Maßstab
  const landName = () => Z.daten.meta.land?.name || "Land";
  function regionInfo(id = Z.region) { return Z.daten.meta.regionen.find((r) => r.id === id); }
  function regionName(id = Z.region) { return id === "bayern" ? landName() : (regionInfo(id)?.name || id); }
  function regionVon(ags) { return Z.daten.meta.regionen.find((r) => r.kreise.includes(String(ags).slice(0, 5)))?.id; }
  function imFokus(ags) { return Z.region === "bayern" || regionVon(ags) === Z.region; }

  /** Gebiete der Ebene im aktuellen Fokus (Region oder ganzes Land), ohne gemeindefreie Gebiete. */
  function fokusGebiete(ebene = Z.ebene) {
    const fc = ebene === "kreis" ? Z.kreise : Z.gemeinden;
    return fc.features.map((f) => f.properties)
      .filter((p) => p.bez !== "Gemeindefreies Gebiet" && imFokus(p.ags) && Z.daten[ebene].gebiete[p.ags]);
  }

  /** Ist der Vergleich innerhalb der Region für diese Ebene statistisch tragfähig? */
  function regionalMoeglich(ebene = Z.ebene) {
    if (Z.region === "bayern") return false;
    const n = ebene === "kreis" ? regionInfo().kreise.length : fokusGebiete("gemeinde").length;
    const min = ebene === "kreis" ? Z.daten.meta.min_kreise_regionaler_vergleich : Z.daten.meta.min_gemeinden_regionaler_vergleich;
    return n >= (min || 10);
  }
  function regionalAktiv(ebene = Z.ebene) { return Z.massstab === "region" && regionalMoeglich(ebene); }
  function vergleichsName(ebene = Z.ebene) { return regionalAktiv(ebene) ? regionName() : landName(); }

  const statCache = new Map();
  /** Mittel und Streuung eines Rohwerts über die Fokusgebiete (für den regionalen Maßstab). */
  function fokusStatistik(ebene, schluessel, jahr, holen) {
    const k = `${ebene}|${Z.region}|${schluessel}|${jahr}`;
    if (statCache.has(k)) return statCache.get(k);
    const werte = fokusGebiete(ebene).map((p) => holen(Z.daten[ebene].gebiete[p.ags])).filter((w) => w != null);
    let erg = null;
    if (werte.length >= 2) {
      const m = werte.reduce((a, b) => a + b, 0) / werte.length;
      const sd = Math.sqrt(werte.reduce((a, b) => a + (b - m) ** 2, 0) / werte.length) || 1;
      erg = { m, sd };
    }
    statCache.set(k, erg);
    return erg;
  }

  /** Durchschnittswert eines Indikators als Vergleichsgröße (Land oder Region). */
  function referenzWert(id, jahr = Z.jahr, ebene = Z.ebene) {
    const j = String(jahr);
    if (regionalAktiv(ebene)) return fokusStatistik(ebene, "ind:" + id, j, (g) => g.werte[id]?.[j])?.m ?? null;
    return Z.daten[ebene].referenz[id]?.[j] ?? null;
  }

  /** Wert auf der 100er-Skala (höher = günstiger) für das aktuelle Merkmal. */
  function skalenwert(ags, merkmal = Z.merkmal, jahr = Z.jahr, ebene = Z.ebene) {
    const g = gebietDaten(ags, ebene);
    if (!g) return null;
    const j = String(jahr);
    const regional = regionalAktiv(ebene);
    if (merkmal === "index" || merkmal.startsWith("dim:")) {
      const holen = merkmal === "index" ? (x) => x.index[j] : (x) => x.dimensionen[merkmal.slice(4)]?.[j];
      const roh = holen(g);
      if (roh == null) return null;
      if (!regional) return roh;
      const st = fokusStatistik(ebene, merkmal, j, holen);
      return st ? 100 + 10 * (roh - st.m) / st.sd : null;
    }
    const id = merkmal.slice(4);
    const wert = g.werte[id]?.[j];
    if (wert == null) return null;
    const richtung = istKontext(id) ? 1 : indikator(id).polaritaet;   // Kontext: nur höher/niedriger
    if (regional) {
      const st = fokusStatistik(ebene, merkmal, j, (x) => x.werte[id]?.[j]);
      return st ? 100 + 10 * richtung * (wert - st.m) / st.sd : null;
    }
    const ref = Z.daten[ebene].referenz[id]?.[j];
    const sd = Z.daten[ebene].statistik[id]?.sd;
    if (ref == null || !sd) return null;
    return 100 + 10 * richtung * (wert - ref) / sd;
  }

  /** Text für Kurzinfo und Rangliste. */
  /** Jahr, aus dem ein fortgeschriebener Wert stammt, sonst null. */
  function fortgeschriebenAus(ags, id, jahr = Z.jahr, ebene = Z.ebene) {
    const f = gebietDaten(ags, ebene)?.fortgeschrieben?.[id];
    return f && f.jahre.includes(String(jahr)) ? f.aus : null;
  }

  function anzeigeWert(ags, merkmal = Z.merkmal) {
    if (merkmal === "index" || merkmal.startsWith("dim:")) return fmt(skalenwert(ags, merkmal), 1);
    const id = merkmal.slice(4);
    const aus = fortgeschriebenAus(ags, id);
    return mitEinheit(gebietDaten(ags)?.werte[id]?.[String(Z.jahr)], indikator(id)) + (aus ? ` (Stand ${aus})` : "");
  }

  /** Kontextindikatoren gehen nicht in den Index ein und werden neutral eingefärbt. */
  function istKontext(id) { return indikator(id)?.im_index === false; }
  function merkmalIstKontext(m = Z.merkmal) { return m.startsWith("ind:") && istKontext(m.slice(4)); }

  function farbe(wert, neutral = merkmalIstKontext()) {
    if (wert == null) return css("--ohne-daten");
    let k = 0;
    while (k < STUFEN.length && wert >= STUFEN[k]) k++;
    return css(`--${neutral ? "n" : "s"}${k + 1}`);
  }

  function merkmalName(m = Z.merkmal) {
    if (m === "index") return "Sozialindex gesamt";
    if (m.startsWith("dim:")) return dimension(m.slice(4)).name;
    return indikator(m.slice(4)).name;
  }

  // ------------------------------------------------------------ Laden
  const holen = async (pfad) => {
    const r = await fetch(pfad, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${pfad}: HTTP ${r.status}`);
    return r.json();
  };

  async function laden() {
    if (window.__SOZIALINDEX__) return window.__SOZIALINDEX__;   // gebündelte Vorschau
    const [kreise, werte] = await Promise.all([holen("data/kreise.geojson"), holen("data/werte.json")]);
    return { kreise, werte };
  }

  /** Lädt Gemeindegrenzen und -werte der Regionen nach, die angezeigt werden sollen. */
  async function gemeindenLaden(regionen) {
    const fehlend = regionen.filter((r) => !Z.geladen.has(r));
    if (!fehlend.length) return;
    $("#lade").hidden = false;
    $("#lade").textContent = "Gemeindedaten werden geladen";
    const pakete = await Promise.all(fehlend.map(async (r) => {
      const vorab = window.__SOZIALINDEX__?.gemeinden?.[r];
      if (vorab) return [r, vorab.geo, vorab.werte];
      const [geo, werte] = await Promise.all([holen(`data/gemeinden/${r}.geojson`), holen(`data/werte_gemeinden/${r}.json`)]);
      return [r, geo, werte];
    }));
    for (const [r, geo, werte] of pakete) {
      Z.gemeinden.features.push(...geo.features);
      Object.assign(Z.daten.gemeinde.gebiete, werte.gebiete);
      Z.geladen.add(r);
    }
    statCache.clear();
    $("#lade").hidden = true;
  }

  // ------------------------------------------------------------ Steuerung
  function merkmalOptionenAufbauen() {
    const sel = $("#merkmal");
    const verfuegbar = new Set(ebenenDaten().indikatoren);
    const gruppen = [];
    gruppen.push(`<option value="index">Sozialindex gesamt</option>`);
    const dimsDa = new Set(ebenenDaten().dimensionen || Z.daten.meta.dimensionen.map((d) => d.id));
    gruppen.push(`<optgroup label="Dimensionen">${Z.daten.meta.dimensionen.filter((d) => dimsDa.has(d.id))
      .map((d) => `<option value="dim:${d.id}">${esc(d.name)}</option>`).join("")}</optgroup>`);
    for (const d of Z.daten.meta.dimensionen) {
      const inds = Z.daten.meta.indikatoren.filter((i) => i.dimension === d.id && verfuegbar.has(i.id) && i.im_index !== false);
      if (inds.length) {
        gruppen.push(`<optgroup label="${esc(d.name)}">${inds
          .map((i) => `<option value="ind:${i.id}">${esc(i.name)}</option>`).join("")}</optgroup>`);
      }
    }
    const kontext = Z.daten.meta.indikatoren.filter((i) => verfuegbar.has(i.id) && i.im_index === false);
    if (kontext.length) {
      gruppen.push(`<optgroup label="Kontext, nicht im Index">${kontext
        .map((i) => `<option value="ind:${i.id}">${esc(i.name)}</option>`).join("")}</optgroup>`);
    }
    sel.innerHTML = gruppen.join("");
    if (![...sel.options].some((o) => o.value === Z.merkmal)) Z.merkmal = "index";
    sel.value = Z.merkmal;
  }

  function suchlisteAufbauen() {
    $("#suchliste").innerHTML = fokusGebiete()
      .map((p) => suchText(p))
      .sort((a, b) => a.localeCompare(b, "de"))
      .map((t) => `<option value="${esc(t)}"></option>`).join("");
  }
  function suchText(p) {
    if (Z.ebene === "kreis") return anzeigeName(p, "kreis");
    if (p.ags.endsWith("000")) return `${p.name} (kreisfreie Stadt)`;
    const k = kreisVon(p.ags);
    return `${p.name} (${k ? anzeigeName(k, "kreis") : ""})`;
  }

  function steuerungVerbinden() {
    const jahre = Z.daten.meta.jahre;
    const regler = $("#jahr");
    regler.min = Math.min(...jahre); regler.max = Math.max(...jahre); regler.value = Z.jahr;
    $("#jahr-anzeige").textContent = Z.jahr;

    regler.addEventListener("input", () => {
      Z.jahr = Number(regler.value);
      $("#jahr-anzeige").textContent = Z.jahr;
      aktualisieren();
    });
    $("#merkmal").addEventListener("change", (e) => { Z.merkmal = e.target.value; aktualisieren(); });
    document.querySelectorAll('input[name="ebene"]').forEach((r) =>
      r.addEventListener("change", async (e) => {
        Z.ebene = e.target.value;
        Z.auswahl = null;
        Karte.map.closePopup();
        if (Z.ebene === "gemeinde") await gemeindenLaden(benoetigteRegionen());
        neuZeichnen();
      }));
    $("#region").addEventListener("change", (e) => regionSetzen(e.target.value, true));
    $("#bezirk-druck")?.addEventListener("click", bezirksuebersicht);   // fehlt in älteren index.html
    document.querySelectorAll('input[name="massstab"]').forEach((r) =>
      r.addEventListener("change", (e) => { Z.massstab = e.target.value; statCache.clear(); neuZeichnen(); }));
    window.addEventListener("hashchange", () => {
      const id = location.hash.slice(1);
      if (id !== Z.region && (id === "bayern" || regionInfo(id))) regionSetzen(id, true, false);
    });
    $("#suche").addEventListener("change", (e) => {
      const liste = fokusGebiete();
      const treffer = liste.find((p) => suchText(p) === e.target.value)
        || liste.find((p) => p.name.toLowerCase() === e.target.value.trim().toLowerCase());
      if (treffer) { gebietOeffnen(treffer.ags, true); e.target.value = ""; }
    });
  }

  function benoetigteRegionen() {
    return Z.region === "bayern" ? Z.daten.meta.regionen.map((r) => r.id) : [Z.region];
  }

  function regionAuswahlAufbauen() {
    $("#region").innerHTML = `<option value="bayern">${esc(landName())} gesamt</option>`
      + Z.daten.meta.regionen.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("");
    $("#region").value = Z.region;
  }

  function massstabAktualisieren() {
    const bezirkKnopf = $("#bezirk-druck");
    if (bezirkKnopf) bezirkKnopf.hidden = Z.region === "bayern";
    const moeglich = regionalMoeglich();
    const feld = $("#massstab-feld");
    feld.hidden = Z.region === "bayern";
    const regionKnopf = document.querySelector('input[name="massstab"][value="region"]');
    regionKnopf.disabled = !moeglich;
    $("#massstab-region-text").textContent = regionName();
    $("#massstab-hinweis").textContent = moeglich ? ""
      : `Ein Vergleich innerhalb von ${regionName()} ist auf ${Z.ebene === "kreis" ? "Kreisebene" : "Gemeindeebene"} nicht sinnvoll, dafür sind es zu wenige Gebiete.`;
    if (!moeglich && Z.massstab === "region") document.querySelector('input[name="massstab"][value="land"]').checked = true;
    if (!moeglich) Z.massstab = Z.massstab === "region" ? "land" : Z.massstab;
  }

  async function regionSetzen(id, zoomen, hashSetzen = true) {
    Z.region = id;
    Z.auswahl = null;
    statCache.clear();
    Karte.map.closePopup();
    $("#region").value = id;
    if (hashSetzen && location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
    document.title = id === "bayern" ? `Sozialindex ${landName()}` : `Sozialindex ${landName()}: ${regionName(id)}`;
    if (Z.ebene === "gemeinde") await gemeindenLaden(benoetigteRegionen());
    neuZeichnen();
    if (zoomen) aufRegionZoomen();
  }

  function aufRegionZoomen() {
    const feats = Z.kreise.features.filter((f) => imFokus(f.properties.ags));
    const b = L.geoJSON({ type: "FeatureCollection", features: feats }).getBounds();
    Karte.map.fitBounds(b, { padding: [24, 24], animate: !reduziert });
  }

  function neuZeichnen() {
    for (const art of Schulen.an) schulenZeichnen(art);
    massstabAktualisieren();
    merkmalOptionenAufbauen();
    suchlisteAufbauen();
    flaechenZeichnen();
    aktualisieren();
  }

  // ------------------------------------------------------------ Schulstandorte
  const SCHULARTEN_NAMEN = { realschule: "Realschulen", gymnasium: "Gymnasien", mittelschule: "Mittelschulen",
    grundschule: "Grundschulen", berufliche: "Berufliche Schulen", foerderzentrum: "Förderzentren", fos: "Fachoberschulen (FOS)" };
  const SCHULART_EINZAHL = { realschule: "Realschule", gymnasium: "Gymnasium", mittelschule: "Mittelschule",
    grundschule: "Grundschule", berufliche: "Berufliche Schule", foerderzentrum: "Förderzentrum", fos: "Fachoberschule" };
  const Schulen = { daten: {}, ebenen: {}, an: new Set() };

  function pinSymbol(art) {
    return `<svg viewBox="0 0 24 32" width="24" height="32" aria-hidden="true" focusable="false">
      <path d="M12 31s10-11.2 10-19A10 10 0 0 0 2 12c0 7.8 10 19 10 19z" fill="var(--pin-${art}, var(--pin))" stroke="var(--pin-rand)" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4" fill="var(--pin-rand)"/></svg>`;
  }

  function schulSchalterAufbauen() {
    const arten = Z.daten.meta.schulstandorte || [];
    if (!arten.length) return;
    $("#schulschalter").hidden = false;
    // Das Häkchen trägt die Farbe der Schulart; so bleibt die Zuordnung ohne zusätzliches Symbol erkennbar
    $("#schulschalter-liste").innerHTML = arten.map((a) => `<label>
        <input type="checkbox" data-schulart="${esc(a)}" style="accent-color: var(--pin-${esc(a)}, var(--pin))">
        ${esc(SCHULARTEN_NAMEN[a] || a)}
        <span class="anzahl" data-anzahl="${esc(a)}"></span></label>`).join("");
    $("#schulschalter-liste").addEventListener("change", async (e) => {
      const art = e.target.dataset.schulart;
      if (!art) return;
      if (e.target.checked) {
        Schulen.an.add(art);
        try {
          if (!Schulen.daten[art]) Schulen.daten[art] = window.__SOZIALINDEX__?.schulen?.[art] || await holen(`data/schulen/${art}.geojson`);
        } catch (err) {
          e.target.checked = false; Schulen.an.delete(art);
          $(`[data-anzahl="${art}"]`).textContent = "(nicht verfügbar)";
          return;
        }
      } else {
        Schulen.an.delete(art);
      }
      schulenZeichnen(art);
    });
  }

  function schulEintrag(p, art) {
    const adresse = [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const kreis = Z.kreise.features.find((f) => f.properties.ags === p.kreis)?.properties;
    const url = p.url ? (/^https?:\/\//i.test(p.url) ? p.url : `https://${p.url}`) : "";
    const zusatz = [p.schulart || SCHULART_EINZAHL[art] || "", p.traeger ? "Träger: " + p.traeger : "",
                    kreis ? anzeigeName(kreis, "kreis") : ""].filter(Boolean).map(esc).join("<br>");
    return `<strong>${esc(p.name)}</strong>${adresse ? esc(adresse) + "<br>" : ""}<span class="leise">${zusatz}</span>`
      + (url ? `<br><a href="${esc(url)}" target="_blank" rel="noopener">Website</a>` : "");
  }

  /** Popup für einen Standort; mehrere Schulen an derselben Adresse werden gemeinsam aufgelistet. */
  function schulPopup(schulen, lat, lon, art) {
    const kopf = schulen.length > 1 ? `<p class="leise">${schulen.length} Schulen an diesem Standort</p>` : "";
    return `<div class="schul-pop">${kopf}${schulen.map((p) => `<div class="schul-eintrag">${schulEintrag(p, art)}</div>`).join("")}
      <a href="https://www.openstreetmap.org/?mlat=${lat}&amp;mlon=${lon}#map=17/${lat}/${lon}" target="_blank" rel="noopener">In OpenStreetMap öffnen</a></div>`;
  }

  /** Markierungen einer Schulart für die aktuelle Region (neu) zeichnen bzw. entfernen. */
  function schulenZeichnen(art) {
    Schulen.ebenen[art]?.remove();
    delete Schulen.ebenen[art];
    const anzeige = $(`[data-anzahl="${art}"]`);
    if (!Schulen.an.has(art) || !Schulen.daten[art]) { if (anzeige) anzeige.textContent = ""; return; }
    const feats = Schulen.daten[art].features.filter((f) => imFokus(f.properties.kreis || ""));
    const icon = L.divIcon({ className: "schul-pin", html: pinSymbol(art), iconSize: [24, 32], iconAnchor: [12, 31], popupAnchor: [0, -28] });
    // Schulen mit identischen Koordinaten (z. B. Gymnasium und Abendgymnasium im selben Gebäude)
    // teilen sich eine Nadel; sonst läge eine unsichtbar unter der anderen.
    const standorte = new Map();
    for (const f of feats) {
      const [lon, lat] = f.geometry.coordinates;
      const k = `${lat.toFixed(5)},${lon.toFixed(5)}`;
      if (!standorte.has(k)) standorte.set(k, { lat, lon, schulen: [] });
      standorte.get(k).schulen.push(f.properties);
    }
    Schulen.ebenen[art] = L.layerGroup([...standorte.values()].map(({ lat, lon, schulen }) => {
      const titel = schulen.length > 1 ? `${schulen.length} Schulen: ${schulen.map((p) => p.name).join("; ")}` : schulen[0].name;
      const m = L.marker([lat, lon], { icon, title: titel, alt: titel, keyboard: true, riseOnHover: true });
      m.bindPopup(() => schulPopup(schulen, lat, lon, art), { maxWidth: 320 });
      return m;
    })).addTo(Karte.map);
    if (anzeige) anzeige.textContent = `(${feats.length.toLocaleString("de-DE")})`;
  }

  // ------------------------------------------------------------ Karte
  function karteAnlegen() {
    Karte.map = L.map("karte", {
      preferCanvas: true,   // schneller bei über 2.000 Gemeindeflächen
      zoomSnap: 0.25, zoomDelta: 0.5, attributionControl: true,
      zoomAnimation: !reduziert, fadeAnimation: !reduziert, markerZoomAnimation: !reduziert,
    });
    // Eigene Ebenen für Umrisse über den Flächen; sie fangen keine Mausereignisse ab.
    for (const [name, z] of [["grenzen", 410], ["auswahl", 420], ["hover", 430]]) {
      Karte.map.createPane(name);
      Karte.map.getPane(name).style.zIndex = z;
      Karte.map.getPane(name).style.pointerEvents = "none";
    }
    Karte.map.on("mouseout", hoverAus);
    // In der Übersicht kleinere Stecknadeln, damit sie sich weniger überdecken
    const pinGroesse = () => Karte.map.getContainer().classList.toggle("pins-klein", Karte.map.getZoom() < 9);
    Karte.map.on("zoomend", pinGroesse);
    pinGroesse();
    Karte.map.attributionControl.setPrefix(false);
    Karte.map.attributionControl.addAttribution("Grenzen © GeoBasis-DE / BKG (dl-de/by-2-0)");
    const grenzen = L.geoJSON(Z.kreise).getBounds();
    Karte.map.fitBounds(grenzen, { padding: [24, 24] });
    Karte.map.setMinZoom(Karte.map.getZoom() - 1);
    Karte.map.setMaxBounds(grenzen.pad(0.5));
    Karte.map.on("popupclose", () => {
      if (Karte.diagramm) { Karte.diagramm.destroy(); Karte.diagramm = null; }
      Z.auswahl = null;
      ranglisteMarkieren();
      stileSetzen();
    });
  }

  function flaechenZeichnen() {
    hoverAus();
    if (Karte.flaechen) Karte.flaechen.remove();
    if (Karte.grenzen) Karte.grenzen.remove();
    Karte.layerNachAgs.clear();
    const fc = Z.ebene === "kreis" ? Z.kreise
      : { type: "FeatureCollection", features: Z.gemeinden.features.filter((f) => imFokus(f.properties.ags)) };

    Karte.flaechen = L.geoJSON(fc, {
      style: () => ({}),
      onEachFeature: (f, layer) => {
        const p = f.properties;
        Karte.layerNachAgs.set(p.ags, layer);
        const freiesGebiet = p.bez === "Gemeindefreies Gebiet";
        if (!imFokus(p.ags)) {   // Kreis außerhalb der gewählten Region
          if (mitMaus) layer.bindTooltip(() => `<strong>${esc(anzeigeName(p, Z.ebene))}</strong><br>${esc(regionName(regionVon(p.ags)))}: zum Wechseln klicken`,
            { sticky: true, className: "kurzinfo", direction: "top", offset: [0, -8] });
          layer.on({
            mouseover: () => { hoverAus(); Karte.hoverLayer = layer; },
            click: () => { hoverAus(); regionSetzen(regionVon(p.ags), true); },
          });
          return;
        }
        if (mitMaus) layer.bindTooltip(() => freiesGebiet
          ? `<span>${esc(p.name)}</span><br><span>Gemeindefreies Gebiet, keine Daten</span>`
          : `<strong>${esc(anzeigeName(p, Z.ebene))}</strong><br>${esc(merkmalName())}: <b>${esc(anzeigeWert(p.ags))}</b>`,
        { sticky: true, className: "kurzinfo", direction: "top", offset: [0, -8] });
        if (freiesGebiet) {
          layer.on("mouseover", () => { hoverAus(); Karte.hoverLayer = layer; });
          return;
        }
        layer.on({
          mouseover: () => hoverAn(layer),
          mouseout: () => { if (Karte.hoverAgs === p.ags) hoverAus(); },
          click: () => { hoverAus(); gebietOeffnen(p.ags, false); },
        });
      },
    }).addTo(Karte.map);

    if (Z.ebene === "gemeinde") {
      Karte.grenzen = L.geoJSON(Z.kreise, {
        interactive: false, pane: "grenzen",
        style: { fill: false, color: css("--kreisgrenze"), weight: 1.6, opacity: 0.85 },
      }).addTo(Karte.map);
    } else {
      Karte.grenzen = null;
    }
    stileSetzen();
  }

  function stilFuer(layer, p) {
    const draussen = !imFokus(p.ags);
    layer.setStyle({
      fillColor: p.bez === "Gemeindefreies Gebiet" || draussen ? css("--ohne-daten") : farbe(skalenwert(p.ags)),
      fillOpacity: draussen ? 0.45 : 1,
      color: css("--kontur"),
      weight: Z.ebene === "kreis" ? 1.4 : 0.6,
    });
  }
  /** Umriss als eigene, nicht anklickbare Ebene; die Flächen werden nie umsortiert. */
  function umriss(feature, pane, gewicht) {
    return L.geoJSON(feature, {
      pane, interactive: false,
      style: { fill: false, color: css("--tinte"), weight: gewicht, opacity: 1 },
    }).addTo(Karte.map);
  }
  function hoverAn(layer) {
    if (!mitMaus) return;
    const ags = layer.feature.properties.ags;
    if (Karte.hoverAgs === ags) return;
    hoverAus();   // Vorgänger immer ausdrücklich zurücksetzen
    Karte.hoverAgs = ags;
    Karte.hoverLayer = layer;
    if (ags !== Z.auswahl) Karte.hoverRand = umriss(layer.feature, "hover", 2.5);
  }
  function hoverAus() {
    if (Karte.hoverRand) Karte.hoverRand.remove();
    if (Karte.hoverLayer) Karte.hoverLayer.closeTooltip();
    Karte.hoverRand = null;
    Karte.hoverAgs = null;
    Karte.hoverLayer = null;
  }
  function stileSetzen() {
    Karte.flaechen.eachLayer((l) => stilFuer(l, l.feature.properties));
    if (Karte.grenzen) Karte.grenzen.setStyle({ color: css("--kreisgrenze") });
    if (Karte.auswahlRand) { Karte.auswahlRand.remove(); Karte.auswahlRand = null; }
    const sel = Z.auswahl && Karte.layerNachAgs.get(Z.auswahl);
    if (sel) Karte.auswahlRand = umriss(sel.feature, "auswahl", 3);
  }

  // ------------------------------------------------------------ Legende & Rangliste
  function legendeZeichnen() {
    $("#legende-titel").textContent = `${merkmalName()}, ${Z.jahr}`;
    const neutral = merkmalIstKontext();
    $("#skala").innerHTML = [1, 2, 3, 4, 5, 6, 7].map((k) => `<span style="background:var(--${neutral ? "n" : "s"}${k})"></span>`).join("");
    const pole = document.querySelectorAll(".skala-pole span");
    pole[0].textContent = neutral ? "niedriger" : "ungünstiger";
    pole[1].textContent = neutral ? "höher" : "günstiger";
    const istIndikator = Z.merkmal.startsWith("ind:");
    $("#legende-hinweis").textContent = istIndikator
      ? `${neutral ? "Kontextindikator, geht nicht in den Index ein. Farbe zeigt, ob der Wert über oder unter dem" : "Farbe zeigt die Abweichung vom"} Durchschnitt der ${Z.ebene === "kreis" ? "Kreise" : "Gemeinden"} in ${vergleichsName()}. ${indikator(Z.merkmal.slice(4)).beschreibung}. ${fortgeschriebenText()}`
      : `100 = Durchschnitt der ${Z.ebene === "kreis" ? "Kreise" : "Gemeinden"} in ${vergleichsName()}. Stufen: unter 85, 85–92, 92–97, 97–103, 103–108, 108–115, ab 115. ${abdeckungText()} ${fortgeschriebenText()}`.trim();
  }

  /** Hinweis, wenn im gewählten Jahr Werte fortgeschrieben sind. */
  function fortgeschriebenText() {
    const gebiete = Object.values(ebenenDaten().gebiete);
    const jahr = String(Z.jahr);
    const ids = Z.merkmal.startsWith("ind:") ? [Z.merkmal.slice(4)] : ebenenDaten().indikatoren
      .filter((id) => !istKontext(id) && (Z.merkmal === "index" || indikator(id).dimension === Z.merkmal.slice(4)));
    const betroffen = ids.filter((id) => gebiete.some((g) => g.fortgeschrieben?.[id]?.jahre.includes(jahr)));
    if (!betroffen.length) return "";
    const aus = [...new Set(betroffen.flatMap((id) => gebiete.map((g) => g.fortgeschrieben?.[id]?.aus).filter(Boolean)))].sort();
    return `Für ${jahr} noch nicht veröffentlicht und mit dem Wert von ${aus.join(" bzw. ")} fortgeschrieben: ${betroffen.map((id) => indikator(id).name).join(", ")}.`;
  }

  /** Jüngstes Jahr, in dem mindestens ein Gebiet im Fokus einen Wert hat (oder null). */
  function letztesJahrMitDaten(merkmal = Z.merkmal) {
    const jahre = [...Z.daten.meta.jahre].sort((a, b) => b - a);
    const gebiete = fokusGebiete();
    return jahre.find((j) => gebiete.some((p) => skalenwert(p.ags, merkmal, j) != null)) ?? null;
  }

  /** Text zum jüngsten Jahr; nennt das Erhebungsjahr, wenn spätere Jahre fortgeschrieben sind. */
  function erhebungText(letztes) {
    const id = Z.merkmal.startsWith("ind:") ? Z.merkmal.slice(4) : null;
    const bis = id ? Z.daten.meta.datenstand?.[id]?.[Z.ebene] : null;
    return bis && bis < letztes
      ? `Erhoben wurde zuletzt ${bis}; bis ${letztes} wird dieser Wert fortgeschrieben.`
      : `Die jüngsten Werte stammen aus ${letztes}.`;
  }

  /** Hinweis samt Knopf, wenn im gewählten Jahr keine Werte vorliegen. */
  function keineDatenHinweis() {
    const el = $("#jahr-hinweis");
    const hatWerte = fokusGebiete().some((p) => skalenwert(p.ags) != null);
    if (hatWerte) { el.hidden = true; return; }
    const letztes = letztesJahrMitDaten();
    el.hidden = false;
    el.innerHTML = letztes
      ? `Für ${Z.jahr} liegen zu „${esc(merkmalName())}“ keine Werte vor. ${erhebungText(letztes)} <button type="button" id="zum-jahr" class="klein-knopf">${letztes} anzeigen</button>`
      : `Zu „${esc(merkmalName())}“ liegen in ${esc(regionName())} keine Werte vor.`;
    $("#zum-jahr")?.addEventListener("click", () => {
      Z.jahr = letztes;
      $("#jahr").value = letztes;
      $("#jahr-anzeige").textContent = letztes;
      aktualisieren();
    });
  }

  function abdeckungText() {
    const e = ebenenDaten();
    const nDims = (e.dimensionen || []).length, alle = Z.daten.meta.dimensionen.length;
    if (nDims >= alle) return "";
    const namen = Z.daten.meta.dimensionen.filter((d) => e.dimensionen.includes(d.id)).map((d) => d.name).join(", ");
    return `Auf dieser Ebene liegen Daten für ${e.indikatoren.length} Indikatoren in ${nDims} von ${alle} Dimensionen vor (${namen}).`;
  }

  function ranglisteZeichnen() {
    const zeilen = fokusGebiete()
      .map((p) => ({ p, w: skalenwert(p.ags) }))
      .filter((z) => z.w != null)
      .sort((a, b) => b.w - a.w);
    $("#rang-titel").textContent = `Rangliste ${regionName()}, ${zeilen.length.toLocaleString("de-DE")} ${Z.ebene === "kreis" ? "Kreise" : "Gemeinden"}`;
    $("#rang").innerHTML = zeilen.map((z, i) => {
      const abw = Math.max(-30, Math.min(30, z.w - 100));
      const links = abw < 0 ? 50 + (abw / 30) * 50 : 50;
      const breite = Math.abs(abw / 30) * 50;
      return `<li><button type="button" data-ags="${z.p.ags}">
        <span class="rang-nr">${i + 1}</span>
        <span class="rang-name" title="${esc(anzeigeName(z.p, Z.ebene))}">${esc(anzeigeName(z.p, Z.ebene))}</span>
        <span class="rang-balken" aria-hidden="true"><i style="left:${links}%;width:${breite}%;background:${farbe(z.w)}"></i></span>
        <span class="rang-wert">${Z.merkmal.startsWith("ind:") ? "" : fmt(z.w, 0)}</span>
      </button></li>`;
    }).join("");
    $("#rang").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => gebietOeffnen(b.dataset.ags, true)));
    ranglisteMarkieren();
  }
  function ranglisteMarkieren() {
    $("#rang").querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-current", b.dataset.ags === Z.auswahl ? "true" : "false"));
  }

  // ------------------------------------------------------------ Popup
  function gebietOeffnen(ags, zoomen) {
    const layer = Karte.layerNachAgs.get(ags);
    if (!layer) return;
    Z.auswahl = ags;
    const oeffnen = () => {
      if (!Karte.popup) {
        Karte.popup = L.popup({ maxWidth: 400, minWidth: 280, autoPanPaddingTopLeft: [20, 70], autoPanPaddingBottomRight: [20, 20] });
      }
      Karte.popup.setLatLng(layer.getBounds().getCenter()).setContent(popupInhalt(layer.feature.properties)).openOn(Karte.map);
      // openOn löst bei einem bereits offenen Popup "popupclose" aus → Auswahl wiederherstellen
      Z.auswahl = ags;
      reiterZeigen(Z.reiter);
      stileSetzen();
      ranglisteMarkieren();
    };
    if (zoomen) {
      Karte.map.closePopup();
      Z.auswahl = ags;
      stileSetzen();
      // erst zoomen, dann Popup öffnen, damit es vollständig sichtbar ins Bild geschoben wird
      Karte.map.once("moveend", oeffnen);
      Karte.map.fitBounds(layer.getBounds(), {
        maxZoom: Z.ebene === "kreis" ? 9.5 : 11,
        paddingTopLeft: [40, Math.round(Math.min(300, Karte.map.getSize().y * 0.42))], paddingBottomRight: [40, 30],
        animate: !reduziert,
      });
      // Falls sich der Ausschnitt nicht ändert, feuert kein moveend
      setTimeout(() => { if (!Karte.map.hasLayer(Karte.popup) || Z.auswahl !== ags) { Karte.map.off("moveend", oeffnen); oeffnen(); } }, reduziert ? 50 : 600);
    } else {
      oeffnen();
    }
  }

  function popupInhalt(p) {
    const g = gebietDaten(p.ags);
    const j = String(Z.jahr);
    const div = document.createElement("div");
    div.className = "pop";
    div.dataset.ags = p.ags;
    const fokus = fokusGebiete().map((x) => ({ a: x.ags, w: skalenwert(x.ags, "index") })).filter((x) => x.w != null).sort((a, b) => b.w - a.w);
    const rangRegion = fokus.findIndex((x) => x.a === p.ags) + 1;
    const rangText = Z.region === "bayern"
      ? `Rang ${g.rang[j] ?? "–"} von ${ebenenDaten().anzahl.toLocaleString("de-DE")}`
      : `Rang ${rangRegion || "–"} von ${fokus.length} in ${regionName()}, ${g.rang[j] ?? "–"} von ${ebenenDaten().anzahl.toLocaleString("de-DE")} in ${landName()}`;
    div.innerHTML = `
      <div class="pop-kopf">
        <div><p class="pop-name">${esc(anzeigeName(p, Z.ebene))}</p>
        <p class="pop-art">${esc(unterzeile(p, Z.ebene))}</p></div>
        <div class="pop-wert"><strong>${fmt(skalenwert(p.ags, "index"), 0)}</strong><span>Index ${Z.jahr}${regionalAktiv() ? ` (Vergleich ${esc(regionName())})` : ""}<br>${esc(rangText)}</span></div>
      </div>
      <div class="reiter" role="tablist">
        <button type="button" role="tab" data-reiter="profil">Profil</button>
        <button type="button" role="tab" data-reiter="verlauf">Verlauf</button>
        <button type="button" role="tab" data-reiter="kennzahlen">Kennzahlen</button>
      </div>
      <div class="pop-flaeche" role="tabpanel"></div>
      <p class="pop-notiz"></p>
      <button type="button" class="druck-knopf" data-druck>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        Drucken oder als PDF speichern</button>`;
    div.querySelectorAll(".reiter button").forEach((b) =>
      b.addEventListener("click", () => { Z.reiter = b.dataset.reiter; reiterZeigen(Z.reiter); }));
    div.querySelector("[data-druck]").addEventListener("click", () => druckansicht(p));
    return div;
  }

  // ------------------------------------------------------------ Druckansicht
  /**
   * Stellt Profil, Verlauf und Kennzahlen des Gebiets auf einer Druckseite zusammen und öffnet den
   * Druckdialog; dort lässt sich auch „Als PDF speichern“ wählen. Die Diagramme werden unsichtbar im
   * hellen Farbschema gezeichnet (im Dunkelmodus wären die Beschriftungen auf Papier unsichtbar).
   */
  function druckansicht(p) {
    const wurzel = document.documentElement;
    const altesSchema = wurzel.dataset.theme;
    const alteFarbe = Chart.defaults.color, alteAnimation = Chart.defaults.animation, alteDichte = Chart.defaults.devicePixelRatio;
    const offenesDiagramm = Karte.diagramm;
    wurzel.dataset.theme = "light";
    Chart.defaults.color = css("--leise");
    Chart.defaults.animation = false;
    Chart.defaults.devicePixelRatio = 2;          // scharf auch im Druck
    const zeichnen = (funktion) => {
      const box = document.createElement("div");
      box.style.cssText = "position:fixed;left:-10000px;top:0;width:620px;height:360px";
      const notiz = document.createElement("p");
      document.body.appendChild(box);
      Karte.diagramm = null;
      funktion(box, notiz, p.ags);
      let bild = "";
      if (Karte.diagramm) { bild = Karte.diagramm.toBase64Image("image/png", 1); Karte.diagramm.destroy(); }
      else if (box.querySelector("canvas")) bild = box.querySelector("canvas").toDataURL("image/png");
      box.remove();
      return { bild, notiz: notiz.textContent };
    };
    let profil, verlauf, tabelle, tabNotiz;
    try {
      profil = zeichnen(profilZeichnen);
      verlauf = zeichnen(verlaufZeichnen);
      const t = document.createElement("div"), tn = document.createElement("p");
      kennzahlenZeichnen(t, tn, p.ags);
      tabelle = t.innerHTML; tabNotiz = tn.textContent;
    } finally {
      Karte.diagramm = offenesDiagramm;
      if (altesSchema === undefined) delete wurzel.dataset.theme; else wurzel.dataset.theme = altesSchema;
      Chart.defaults.color = alteFarbe; Chart.defaults.animation = alteAnimation; Chart.defaults.devicePixelRatio = alteDichte;
    }
    const kopf = document.querySelector(".leaflet-popup .pop .pop-kopf")?.outerHTML || "";
    const stand = Z.daten.meta.erstellt ? new Date(Z.daten.meta.erstellt).toLocaleDateString("de-DE") : "";
    const bereich = $("#druckansicht");
    bereich.innerHTML = `
      <header class="druck-kopf">
        <p class="druck-titel">Sozialindex ${esc(landName())}${Z.region !== "bayern" ? ": " + esc(regionName()) : ""}</p>
        ${kopf}
        <p class="druck-meta">Jahr ${Z.jahr}. 100 entspricht dem Durchschnitt der ${Z.ebene === "kreis" ? "Kreise" : "Gemeinden"} in ${esc(vergleichsName())}; höhere Werte sind günstiger.</p>
      </header>
      <div class="druck-diagramme">
        <section><h2>Profil</h2>${profil.bild ? `<img src="${profil.bild}" alt="Profil">` : "<p>Kein Profil verfügbar.</p>"}<p class="druck-notiz">${esc(profil.notiz)}</p></section>
        <section><h2>Verlauf: ${esc(merkmalName())}</h2>${verlauf.bild ? `<img src="${verlauf.bild}" alt="Verlauf">` : "<p>Kein Verlauf verfügbar.</p>"}<p class="druck-notiz">${esc(verlauf.notiz)}</p></section>
      </div>
      <section class="druck-tabelle"><h2>Kennzahlen ${Z.jahr}</h2>${tabelle}<p class="druck-notiz">${esc(tabNotiz)}</p></section>
      <footer class="druck-fuss">Berechnet am ${esc(stand)}. Quellen, Methodik und Lizenzen: ${esc(location.href.split("#")[0])}#${esc(Z.region)} (Abschnitt „Quellen und Lizenzen“).</footer>`;
    document.body.classList.add("drucken");
    const wurzelD = document.documentElement, schemaD = wurzelD.dataset.theme;
    wurzelD.dataset.theme = "light";        // Seitenränder nie dunkel drucken
    const aufraeumen = () => {
      document.body.classList.remove("drucken"); bereich.innerHTML = "";
      if (schemaD === undefined) delete wurzelD.dataset.theme; else wurzelD.dataset.theme = schemaD;
    };
    window.addEventListener("afterprint", aufraeumen, { once: true });
    // erst drucken, wenn die Diagrammbilder geladen sind
    Promise.all([...bereich.querySelectorAll("img")].map((i) => i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))
      .then(() => setTimeout(() => window.print(), 50));
  }

  // ------------------------------------------------------------ Bezirksübersicht (Druck)
  /** Führt fn im hellen Farbschema ohne Animation aus (für Druckbilder) und stellt danach alles wieder her. */
  function imDruckschema(fn) {
    const wurzel = document.documentElement;
    const altesSchema = wurzel.dataset.theme;
    const alt = { farbe: Chart.defaults.color, animation: Chart.defaults.animation, dichte: Chart.defaults.devicePixelRatio };
    wurzel.dataset.theme = "light";
    Chart.defaults.color = css("--leise");
    Chart.defaults.animation = false;
    Chart.defaults.devicePixelRatio = 2;
    try { return fn(); } finally {
      if (altesSchema === undefined) delete wurzel.dataset.theme; else wurzel.dataset.theme = altesSchema;
      Chart.defaults.color = alt.farbe; Chart.defaults.animation = alt.animation; Chart.defaults.devicePixelRatio = alt.dichte;
    }
  }

  /** Zeichnet ein Diagramm unsichtbar in fester Größe und gibt es als PNG-Bild zurück. */
  function diagrammBild(config, breite = 620, hoehe = 360) {
    const box = document.createElement("div");
    box.style.cssText = `position:fixed;left:-10000px;top:0;width:${breite}px;height:${hoehe}px`;
    const canvas = document.createElement("canvas");
    box.appendChild(canvas);
    document.body.appendChild(box);
    const diagramm = new Chart(canvas, config);
    const bild = diagramm.toBase64Image("image/png", 1);
    diagramm.destroy();
    box.remove();
    return bild;
  }

  /** Senkrechte Bezugslinien (z. B. Ø Bezirk, Bayern = 100) in einem waagrechten Balkendiagramm. */
  const bezugslinien = (linien) => ({
    id: "bezugslinien",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: f, scales: { x } } = chart;
      ctx.save();
      const sortiert = linien.filter((l) => l.wert != null).map((l) => ({ ...l, px: x.getPixelForValue(l.wert) })).sort((a, b) => a.px - b.px);
      // Liegen zwei Linien nah beieinander, Beschriftungen nach links bzw. rechts auseinanderziehen
      const eng = sortiert.length === 2 && sortiert[1].px - sortiert[0].px < 160;
      sortiert.forEach((l, i) => {
        ctx.strokeStyle = l.farbe; ctx.lineWidth = 1.5; ctx.setLineDash(l.strich || []);
        ctx.beginPath(); ctx.moveTo(l.px, f.top); ctx.lineTo(l.px, f.bottom); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = l.farbe; ctx.font = `600 ${l.schrift || 12}px ` + css("--schrift");
        ctx.textAlign = eng ? (i === 0 ? "right" : "left") : "center";
        ctx.fillText(l.text, l.px + (eng ? (i === 0 ? -6 : 6) : 0), f.top - 8);
      });
      ctx.restore();
    },
  });

  function bezirksuebersicht() {
    if (Z.region === "bayern") return;
    const j = String(Z.jahr);
    const jahre = Z.daten.meta.jahre.map(String);
    const daten = Z.daten.kreis.gebiete;
    const kreise = Z.kreise.features.map((f) => f.properties).filter((p) => imFokus(p.ags) && daten[p.ags]);
    // nur Dimensionen, für die im gewählten Jahr Werte vorliegen (leere Spalten und Achsen weglassen)
    const dims = Z.daten.meta.dimensionen.filter((d) => kreise.some((p) => daten[p.ags].dimensionen?.[d.id]?.[j] != null));
    // Werte immer im bayerischen Maßstab (100 = Durchschnitt der Kreise Bayerns)
    const wert = (ags, schluessel, jahr = j) => schluessel === "index"
      ? daten[ags].index?.[jahr] ?? null : daten[ags].dimensionen?.[schluessel]?.[jahr] ?? null;
    const mittel = (liste) => { const v = liste.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const spalten = ["index", ...dims.map((d) => d.id)];
    const zeilen = kreise.map((p) => ({ p, w: Object.fromEntries(spalten.map((s) => [s, wert(p.ags, s)])), rang: daten[p.ags].rang?.[j] }))
      .sort((a, b) => (b.w.index ?? -1e9) - (a.w.index ?? -1e9));
    zeilen.forEach((z, i) => { z.rangBezirk = z.w.index == null ? null : i + 1; });
    const bezirk = Object.fromEntries(spalten.map((s) => [s, mittel(zeilen.map((z) => z.w[s]))]));
    // Kurznamen, damit Tabelle und Diagramm auf eine Seite passen: „Bamberg (Stadt)“, „Bamberg (Lkr.)“
    const name = (p) => `${p.name} (${p.bez === "Landkreis" ? "Lkr." : "Stadt"})`;
    // Kennzahlen der Übersicht mit Bezirks- und Bayernwert (Bayern = Mittel der bayerischen Kreise)
    const kennIds = ["alq", "sgb2", "alt65", "bev5", "wand", "uebertritt_rs"].filter((id) => indikator(id));
    const kennWert = (ags, id) => daten[ags].werte?.[id]?.[j] ?? null;
    const kennBezirk = Object.fromEntries(kennIds.map((id) => [id, mittel(kreise.map((p) => kennWert(p.ags, id)))]));
    const kennBayern = Object.fromEntries(kennIds.map((id) => [id, Z.daten.kreis.referenz[id]?.[j] ?? null]));
    const kennFarbe = (id, v) => {      // Abweichung vom bayerischen Durchschnitt; Kontextindikatoren neutral
      const ref = kennBayern[id], sd = Z.daten.kreis.statistik[id]?.sd;
      if (v == null || ref == null || !sd) return css("--ohne-daten");
      const kontext = istKontext(id);
      return farbe(100 + 10 * (kontext ? 1 : indikator(id).polaritaet) * (v - ref) / sd, kontext);
    };
    const kurz = { alq: "Arbeitslosen&shy;quote", sgb2: "SGB-II-&shy;Quote", alt65: "Anteil 65+", bev5: "Bevölkerungs&shy;entw. 5 J.",
                   wand: "Wanderungs&shy;saldo je 10.000 EW", uebertritt_rs: "Übertritt Real&shy;schule" };

    const { balken, verlauf, profil, tabelle } = imDruckschema(() => {
      const gruen = css("--s6"), violett = css("--s2"), tinte = css("--tinte"), leise = css("--leise");
      const balken = diagrammBild({
        type: "bar",
        data: { labels: zeilen.map((z) => name(z.p)),
                datasets: [{ data: zeilen.map((z) => z.w.index), backgroundColor: zeilen.map((z) => farbe(z.w.index, false)), borderWidth: 0, barPercentage: 0.8 }] },
        options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { top: 30 } },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { min: Math.min(80, ...zeilen.map((z) => z.w.index ?? 100)) - 2, max: Math.max(120, ...zeilen.map((z) => z.w.index ?? 100)) + 2,
                         grid: { color: "#e6e6e6" }, ticks: { font: { size: 18 } } },
                    y: { grid: { display: false }, ticks: { color: tinte, font: { size: 20 } } } } },
        plugins: [bezugslinien([{ wert: 100, farbe: leise, text: "Bayern 100", strich: [8, 6], schrift: 19 },
                                { wert: bezirk.index, farbe: tinte, text: `Ø Bezirk ${fmt(bezirk.index, 0)}`, schrift: 19 }])],
      }, 900, 560);
      const reihe = (fn) => jahre.map((jj) => fn(jj));
      const verlauf = diagrammBild({
        type: "line",
        data: { labels: jahre, datasets: [
          { label: "Spanne der Kreise", data: reihe((jj) => { const v = kreise.map((p) => wert(p.ags, "index", jj)).filter((x) => x != null); return v.length ? Math.max(...v) : null; }),
            borderWidth: 0, pointRadius: 0, backgroundColor: "rgba(120,120,120,.15)", fill: "+1" },
          { label: "schwächster Kreis", data: reihe((jj) => { const v = kreise.map((p) => wert(p.ags, "index", jj)).filter((x) => x != null); return v.length ? Math.min(...v) : null; }),
            borderWidth: 0, pointRadius: 0, fill: false },
          { label: "Ø Bezirk", data: reihe((jj) => mittel(kreise.map((p) => wert(p.ags, "index", jj)))), borderColor: tinte, borderWidth: 2.5, pointRadius: 2, tension: 0.25, fill: false },
          { label: "Bayern", data: reihe(() => 100), borderColor: leise, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
        ] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { filter: (i) => i.text !== "schwächster Kreis", boxWidth: 16, font: { size: 15 } } }, tooltip: { enabled: false } },
          scales: { y: { grid: { color: "#e6e6e6" }, ticks: { font: { size: 15 } } }, x: { grid: { display: false }, ticks: { font: { size: 15 } } } } },
      }, 620, 520);
      const profil = diagrammBild({
        type: "radar",
        data: { labels: dims.map((d) => DIM_KURZ[d.id] || d.name), datasets: [
          { label: "Ø Bezirk", data: dims.map((d) => bezirk[d.id]), borderColor: gruen, backgroundColor: "rgba(60,130,90,.18)", borderWidth: 2, pointRadius: 3 },
          { label: "Bayern", data: dims.map(() => 100), borderColor: leise, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false },
        ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { enabled: false }, legend: { labels: { boxWidth: 16, font: { size: 15 } } } },
          scales: { r: { suggestedMin: Math.min(85, ...dims.map((d) => bezirk[d.id] ?? 100)) - 3, suggestedMax: Math.max(115, ...dims.map((d) => bezirk[d.id] ?? 100)) + 3,
                         ticks: { display: false }, pointLabels: { color: tinte, font: { size: 17, weight: "600" } } } } },
      }, 520, 520);
      const zelle = (w) => w == null ? `<td>–</td>` : `<td><span class="punkt" style="background:${farbe(w, false)}"></span>${fmt(w, 0)}</td>`;
      const kennZelle = (id, v, stern = false) => v == null ? `<td class="kenn">–</td>`
        : `<td class="kenn"><span class="punkt" style="background:${kennFarbe(id, v)}"></span>${mitEinheit(v, indikator(id))}${stern ? "*" : ""}</td>`;
      let fortgeschrieben = false;
      const tabelle = `<table class="uebersicht">
        <thead>
          <tr class="gruppe"><th></th><th colspan="${spalten.length}">Index (Bayern = 100)</th><th colspan="${kennIds.length}" class="kenn">Kennzahlen ${Z.jahr}</th></tr>
          <tr><th>Kreis</th><th>Gesamt</th>${dims.map((d) => `<th>${esc(DIM_KURZ[d.id] || d.name)}</th>`).join("")}
            ${kennIds.map((id) => `<th class="kenn">${kurz[id] || esc(indikator(id).name)}</th>`).join("")}</tr>
        </thead>
        <tbody>${zeilen.map((z) => `<tr><td>${esc(name(z.p))}</td>${spalten.map((s) => zelle(z.w[s])).join("")}
          ${kennIds.map((id) => { const st = !!fortgeschriebenAus(z.p.ags, id, Z.jahr, "kreis"); fortgeschrieben ||= st; return kennZelle(id, kennWert(z.p.ags, id), st); }).join("")}</tr>`).join("")}
          <tr class="vergleich erste"><td>Ø ${esc(regionName())}</td>${spalten.map((s) => zelle(bezirk[s])).join("")}${kennIds.map((id) => kennZelle(id, kennBezirk[id])).join("")}</tr>
          <tr class="vergleich"><td>Bayern</td>${spalten.map(() => `<td>100</td>`).join("")}${kennIds.map((id) => kennZelle(id, kennBayern[id])).join("")}</tr>
        </tbody></table>${fortgeschrieben ? `<p class="druck-notiz">* Für ${Z.jahr} noch nicht veröffentlicht; letzter verfügbarer Wert fortgeschrieben.</p>` : ""}`;
      return { balken, verlauf, profil, tabelle };
    });

    const stand = Z.daten.meta.erstellt ? new Date(Z.daten.meta.erstellt).toLocaleDateString("de-DE") : "";
    const diff = bezirk.index == null ? "" : bezirk.index >= 100 ? `${fmt(bezirk.index - 100, 1)} Punkte über` : `${fmt(100 - bezirk.index, 1)} Punkte unter`;
    const bereich = $("#druckansicht");
    bereich.classList.add("quer");
    bereich.innerHTML = `
      <header class="druck-kopf">
        <div class="pop-kopf"><div><p class="druck-titel">Sozialindex ${esc(landName())}: Bezirksübersicht ${Z.jahr}</p>
          <p class="pop-name">${esc(regionName())}</p>
          <p class="pop-art">${zeilen.length} Kreise und kreisfreie Städte. Index im bayerischen Maßstab: 100 = Durchschnitt aller Kreise Bayerns, höher ist günstiger.
            Ø ${esc(regionName())} = ungewichteter Mittelwert der Kreise.</p></div>
          <div class="pop-wert"><strong>${fmt(bezirk.index, 0)}</strong><span>Gesamtindex Ø ${esc(regionName())}<br>${diff ? diff + " dem bayerischen Durchschnitt" : ""}</span></div></div>
      </header>
      <div class="druck-diagramme drei">
        <section><h2>Gesamtindex der Kreise</h2><img src="${balken}" alt="Gesamtindex der Kreise"></section>
        <section><h2>Verlauf: Ø Bezirk und Bayern</h2><img src="${verlauf}" alt="Verlauf"><p class="druck-notiz">Grau: Spanne vom schwächsten bis zum besten Kreis.</p></section>
        <section><h2>Profil: Ø Bezirk und Bayern</h2><img src="${profil}" alt="Profil"><p class="druck-notiz">Weiter außen ist günstiger.</p></section>
      </div>
      <section class="druck-tabelle">${tabelle}
        <p class="druck-notiz">Farbpunkte: Abweichung vom bayerischen Durchschnitt, grün günstiger, violett ungünstiger; blau: Kontextkennzahl ohne Wertung (höher/niedriger).
          Bayern bei den Kennzahlen: Durchschnitt der bayerischen Kreise. Berechnet am ${esc(stand)}. Quellen und Methodik: ${esc(location.href.split("#")[0])}#${esc(Z.region)}</p></section>`;
    // Während des Drucks ganz auf Hell, damit Seitenränder nie dunkel gedruckt werden
    const wurzel = document.documentElement, schema = wurzel.dataset.theme;
    wurzel.dataset.theme = "light";
    window.addEventListener("afterprint", () => {
      bereich.classList.remove("quer");
      if (schema === undefined) delete wurzel.dataset.theme; else wurzel.dataset.theme = schema;
    }, { once: true });
    document.body.classList.add("drucken");
    window.addEventListener("afterprint", () => { document.body.classList.remove("drucken"); bereich.innerHTML = ""; }, { once: true });
    Promise.all([...bereich.querySelectorAll("img")].map((i) => i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))
      .then(() => setTimeout(() => window.print(), 50));
  }

  function reiterZeigen(name) {
    const pop = document.querySelector(".leaflet-popup .pop");
    if (!pop) return;
    pop.querySelectorAll(".reiter button").forEach((b) => b.setAttribute("aria-selected", b.dataset.reiter === name));
    const flaeche = pop.querySelector(".pop-flaeche");
    const notiz = pop.querySelector(".pop-notiz");
    if (Karte.diagramm) { Karte.diagramm.destroy(); Karte.diagramm = null; }
    flaeche.innerHTML = "";
    flaeche.classList.toggle("tabelle", name === "kennzahlen");
    const ags = pop.dataset.ags;
    if (name === "profil") profilZeichnen(flaeche, notiz, ags);
    else if (name === "verlauf") verlaufZeichnen(flaeche, notiz, ags);
    else kennzahlenZeichnen(flaeche, notiz, ags);
    Karte.popup?.update();
  }

  function diagrammGrundlagen() {
    Chart.defaults.font.family = css("--schrift");
    Chart.defaults.font.size = 12;
    Chart.defaults.color = css("--leise");
    Chart.defaults.animation = reduziert ? false : { duration: 300 };
  }

  function profilZeichnen(flaeche, notiz, ags) {
    const g = gebietDaten(ags);
    const j = String(Z.jahr);
    const dims = Z.daten.meta.dimensionen.filter((d) => skalenwert(ags, "dim:" + d.id) != null);
    const werte = dims.map((d) => skalenwert(ags, "dim:" + d.id));
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Profil: " + dims.map((d, i) => `${d.name} ${fmt(werte[i], 0)}`).join(", "));
    flaeche.appendChild(canvas);
    if (dims.length < 3) { profilBalken(canvas, dims, werte, notiz); return; }
    const min = Math.min(90, ...werte) - 6, max = Math.max(110, ...werte) + 6;
    Karte.diagramm = new Chart(canvas, {
      type: "radar",
      data: {
        labels: dims.map((d) => DIM_KURZ[d.id] || d.name),
        datasets: [
          { label: vergleichsName(), data: dims.map(() => 100), borderColor: css("--leise"), borderDash: [4, 4],
            borderWidth: 1.5, pointRadius: 0, fill: false },
          { label: "Gebiet", data: werte, borderColor: css("--s7"), backgroundColor: hexAlpha(css("--s7"), 0.22),
            borderWidth: 2.5, pointRadius: 3.5, pointBackgroundColor: werte.map(farbe), pointBorderColor: css("--tinte"), pointBorderWidth: 1, fill: true },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.r, 0)}` } } },
        scales: { r: {
          min: Math.floor(min / 5) * 5, max: Math.ceil(max / 5) * 5,
          ticks: { stepSize: 5, display: false },
          grid: { color: css("--linie") }, angleLines: { color: css("--linie") },
          pointLabels: { color: css("--tinte"), font: { size: 12, weight: "700" } },
        } },
      },
    });
    notiz.textContent = `Werte: ${dims.map((d, i) => `${DIM_KURZ[d.id] || d.name} ${fmt(werte[i], 0)}`).join(", ")}. Gestrichelt: Durchschnitt in ${vergleichsName()} (100); weiter außen ist günstiger.`;
  }

  function profilBalken(canvas, dims, werte, notiz) {
    Karte.diagramm = new Chart(canvas, {
      type: "bar",
      data: { labels: dims.map((d) => d.name), datasets: [{ data: werte.map((w) => w - 100), backgroundColor: werte.map(farbe), borderRadius: 3 }] },
      options: {
        indexAxis: "y", maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt(werte[c.dataIndex], 0) } } },
        scales: {
          x: { min: -30, max: 30, grid: { color: (c) => (c.tick.value === 0 ? css("--leise") : css("--linie")) },
               ticks: { callback: (v) => fmt(100 + v, 0) } },
          y: { grid: { display: false }, ticks: { color: css("--tinte"), font: { weight: "700" } } },
        },
      },
    });
    notiz.textContent = `Werte: ${dims.map((d, i) => `${d.name} ${fmt(werte[i], 0)}`).join(", ")}. 100 = Durchschnitt in ${vergleichsName()}; rechts ist günstiger.`;
  }

  function verlaufZeichnen(flaeche, notiz, ags) {
    const linie = merkmalIstKontext() ? css("--n6") : css("--s7");
    const g = gebietDaten(ags);
    const jahre = Z.daten.meta.jahre.map(String);
    let reihe, referenz, titel, einheitText = "", fortgIdx = new Set();
    if (Z.merkmal === "index" || Z.merkmal.startsWith("dim:")) {
      reihe = jahre.map((j) => skalenwert(ags, Z.merkmal, j));
      referenz = jahre.map(() => 100);
      titel = merkmalName();
      notiz.textContent = `${titel} im Zeitverlauf. Gestrichelt: Durchschnitt in ${vergleichsName()} im jeweiligen Jahr (100).`;
    } else {
      const id = Z.merkmal.slice(4);
      const ind = indikator(id);
      reihe = jahre.map((j) => g.werte[id]?.[j] ?? null);
      referenz = jahre.map((j) => referenzWert(id, j));
      titel = ind.name;
      einheitText = ind.einheit;
      const f = g.fortgeschrieben?.[id];
      fortgIdx = new Set((f?.jahre || []).map((j) => jahre.indexOf(j)));
      notiz.textContent = `${ind.name} (${ind.einheit}). Gestrichelt: Durchschnitt der ${Z.ebene === "kreis" ? "Kreise" : "Gemeinden"} in ${vergleichsName()}.`
        + (f ? ` Hohle Punkte: ${f.jahre.join(" und ")} noch nicht veröffentlicht, Wert von ${f.aus} fortgeschrieben.` : "");
    }
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${titel}: ` + jahre.map((j, i) => `${j} ${fmt(reihe[i])}`).join(", "));
    flaeche.appendChild(canvas);
    const aktiv = jahre.indexOf(String(Z.jahr));
    Karte.diagramm = new Chart(canvas, {
      type: "line",
      data: {
        labels: jahre,
        datasets: [
          { label: vergleichsName(), data: referenz, borderColor: css("--leise"), borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
          { label: "Gebiet", data: reihe, borderColor: linie, borderWidth: 2.5, tension: 0.25,
            pointRadius: jahre.map((_, i) => (i === aktiv ? 5 : fortgIdx.has(i) ? 3.5 : 2)),
            pointBackgroundColor: jahre.map((_, i) => (fortgIdx.has(i) ? css("--papier") : linie)),
            pointBorderColor: linie, pointBorderWidth: 1.5,
            segment: { borderDash: (c) => (fortgIdx.has(c.p1DataIndex) ? [5, 4] : undefined) } },
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y)}${einheitText ? " " + einheitText : ""}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 8 } },
          y: { grid: { color: css("--linie") }, ticks: { callback: (v) => fmt(v, Number.isInteger(v) ? 0 : 1) } },
        },
      },
    });
  }

  function kennzahlenZeichnen(flaeche, notiz, ags) {
    const g = gebietDaten(ags);
    const j = String(Z.jahr);
    let fussnote = false;
    const zeile = (ind, wert, ref, punktFarbe, aus) => {
      if (aus) fussnote = true;
      return `<tr>
      <th scope="row">${esc(ind.name)}</th>
      <td${aus ? ` title="Noch nicht veröffentlicht; Wert von ${aus} fortgeschrieben"` : ""}>${esc(mitEinheit(wert, ind))}${aus ? '<sup class="fortg">*</sup>' : ""}<span class="punkt" style="background:${punktFarbe}" aria-hidden="true"></span></td>
      <td class="einheit">${esc(mitEinheit(ref, ind))}</td></tr>`;
    };

    let html = `<table class="kennzahlen"><colgroup><col class="c-name"><col class="c-wert"><col class="c-ref"></colgroup><thead><tr><th>${Z.jahr}</th><th>Wert</th><th>Ø ${regionalAktiv() ? "Region" : esc(landName())}</th></tr></thead><tbody>`;
    for (const id of ebenenDaten().indikatoren.filter((x) => !istKontext(x))) {
      const ind = indikator(id);
      html += zeile(ind, g.werte[id]?.[j], referenzWert(id), farbe(skalenwert(ags, "ind:" + id), false), fortgeschriebenAus(ags, id));
    }
    if (Z.ebene === "gemeinde") {
      const kAgs = ags.slice(0, 5);
      const kg = gebietDaten(kAgs, "kreis");
      const nurKreis = Z.daten.kreis.indikatoren.filter((id) => !Z.daten.gemeinde.indikatoren.includes(id) && !istKontext(id));
      if (kg && nurKreis.length) {
        html += `<tr class="zwischen"><th colspan="3">Nur auf Kreisebene verfügbar (Wert des Kreises)</th></tr>`;
        for (const id of nurKreis) {
          html += zeile(indikator(id), kg.werte[id]?.[j], referenzWert(id, Z.jahr, "kreis"),
            farbe(skalenwert(kAgs, "ind:" + id, Z.jahr, "kreis"), false), fortgeschriebenAus(kAgs, id, Z.jahr, "kreis"));
        }
      }
    }
    // Kontextindikatoren: eigener Abschnitt, neutral eingefärbt (bei Gemeinden der Kreiswert)
    const kEbene = Z.ebene === "gemeinde" ? "kreis" : Z.ebene;
    const kAgs2 = Z.ebene === "gemeinde" ? ags.slice(0, 5) : ags;
    const kg2 = gebietDaten(kAgs2, kEbene);
    const kontextIds = (Z.daten[kEbene].kontext || []).filter((id) => kg2?.werte[id]);
    if (kontextIds.length) {
      html += `<tr class="zwischen"><th colspan="3">Kontext, nicht im Index${Z.ebene === "gemeinde" ? " (Wert des Kreises)" : ""}</th></tr>`;
      for (const id of kontextIds) {
        html += zeile(indikator(id), kg2.werte[id]?.[j], referenzWert(id, Z.jahr, kEbene),
          farbe(skalenwert(kAgs2, "ind:" + id, Z.jahr, kEbene), true), fortgeschriebenAus(kAgs2, id, Z.jahr, kEbene));
      }
    }
    flaeche.innerHTML = html + "</tbody></table>";
    notiz.textContent = "Der farbige Punkt zeigt, ob der Wert günstiger (grün) oder ungünstiger (violett) als der Durchschnitt ist."
      + (fussnote ? " * Für dieses Jahr noch nicht veröffentlicht; letzter verfügbarer Wert fortgeschrieben." : "");
  }

  function hexAlpha(farbe, a) {
    const m = farbe.match(/^#([0-9a-f]{6})$/i);
    if (!m) return farbe;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ------------------------------------------------------------ Gesamt
  function aktualisieren() {
    stileSetzen();
    legendeZeichnen();
    keineDatenHinweis();
    ranglisteZeichnen();
    if (Z.auswahl && Karte.map.hasLayer(Karte.popup)) {
      const p = Karte.layerNachAgs.get(Z.auswahl)?.feature.properties;
      if (p) {
        Karte.popup.setContent(popupInhalt(p));
        reiterZeigen(Z.reiter);
      }
    }
  }

  function fussZeichnen() {
    const m = Z.daten.meta;
    const eintraege = new Map();
    for (const ebene of ["kreis", "gemeinde"]) {
      for (const [id, q] of Object.entries(m.quellen?.[ebene] || {})) {
        const ind = indikator(id);
        if (!ind) continue;
        const text = q.feld_titel
          ? `${q.quelle}: „${q.feld_titel}“ (${q.code}${q.feld ? "/" + q.feld : ""})`
          : q.code ? `${q.quelle}, ${q.code}${q.feld ? " (" + q.feld + ")" : ""}` : q.quelle;
        const schluessel = `${ind.name}|${text}`;
        const alt = eintraege.get(schluessel);
        eintraege.set(schluessel, { id, name: ind.name, text, ebenen: [...(alt?.ebenen || []), ebene === "kreis" ? "Kreise" : "Gemeinden"] });
      }
    }
    const letztesJahr = Math.max(...m.jahre);
    const standText = (id) => {
      const st = m.datenstand?.[id];
      if (!st) return "";
      if (st.konstant) return { text: `Stand: ${st.hinweis || "fester Stand"}`, alt: false };
      const bis = Math.max(st.kreis || 0, st.gemeinde || 0);
      return { text: `Daten bis ${bis}`, alt: bis < letztesJahr - 1 };
    };
    for (const e of eintraege.values()) e.stand = standText(e.id);
    $("#quellen").innerHTML = [...eintraege.values()]
      .map((e) => `<li>${esc(e.name)}: ${esc(e.text)}, ${esc(e.ebenen.join(" und "))}${e.stand
        ? `. <span class="${e.stand.alt ? "stand-alt" : ""}">${esc(e.stand.text)}${e.stand.alt ? ", älter als ein Jahr" : ""}</span>` : ""}</li>`).join("")
      + `<li>Amtliche Statistik: © Statistische Ämter des Bundes und der Länder, dl-de/by-2-0</li>`;
    const datum = new Date(m.erstellt).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
    $("#stand").textContent = `Zuletzt berechnet am ${datum}. Den Stand jeder Quelle zeigt „Quellen und Lizenzen“.`;
    $("#demo-hinweis").hidden = !m.demo;
  }

  async function start() {
    try {
      const { kreise, werte } = await laden();
      Z.kreise = kreise; Z.daten = werte;
      Z.gemeinden = { type: "FeatureCollection", features: [] };
      Z.daten.gemeinde.gebiete = Z.daten.gemeinde.gebiete || {};
      Z.jahr = Math.max(...werte.meta.jahre);
      const start = location.hash.slice(1);
      Z.region = start === "bayern" || regionInfo(start) ? start : "bayern";
      $("#titel").textContent = `Sozialindex ${landName()}`;
      diagrammGrundlagen();
      karteAnlegen();
      regionAuswahlAufbauen();
      schulSchalterAufbauen();
      steuerungVerbinden();
      fussZeichnen();
      $("#lade").hidden = true;
      await regionSetzen(Z.region, Z.region !== "bayern", false);
      // Farbschema-Wechsel des Systems übernehmen
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        diagrammGrundlagen(); stileSetzen(); ranglisteZeichnen();
        if (Z.auswahl) reiterZeigen(Z.reiter);
      });
    } catch (e) {
      const lade = $("#lade");
      lade.classList.add("fehler");
      lade.textContent = location.protocol === "file:"
        ? `Die Daten konnten nicht geladen werden (${e.message}). Die Seite muss über einen Webserver aufgerufen werden, nicht als lokale Datei.`
        : `Die Karte konnte nicht gestartet werden (${e.message}). Bitte die Seite neu laden (Strg + F5). Bleibt der Fehler, passen vermutlich die Programmdateien nicht zusammen, etwa index.html und app.js aus verschiedenen Ständen.`;
      console.error(e);
    }
  }

  start();
})();
