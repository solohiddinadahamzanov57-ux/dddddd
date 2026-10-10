/*
 * Driver Desk — smart lead importer.
 *
 * Accepts Excel / CSV / ODS / Word (.docx) / PDF / photos / pasted text.
 *  - Spreadsheets are read in the browser. Columns are matched by their header
 *    AND by what the values look like (phone numbers, emails, state codes,
 *    names), so it works even when headers are missing or oddly named. The
 *    user can fix any column in the review step.
 *  - Word, PDF, photos and pasted text go to /api/import/extract, where
 *    Workers AI picks out each person. Scanned PDFs are turned into page images
 *    first. If the AI is unavailable, a simpler pattern-based reader is used.
 * Nothing is saved until the user reviews the table and clicks Import.
 */
(function () {
  const DD = () => window.DD;

  // ---------- Libraries (loaded only when needed) ----------

  const LIBS = {
    xlsx: [
      "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    ],
    mammoth: [
      "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js",
      "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js",
    ],
    pdf: [
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
    ],
  };
  const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const loaded = {};

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Couldn't load " + src));
      document.head.appendChild(s);
    });
  }

  async function lib(name) {
    if (!loaded[name]) {
      loaded[name] = (async () => {
        let lastErr;
        for (const url of LIBS[name]) {
          try {
            await loadScript(url);
            return;
          } catch (e) {
            lastErr = e;
          }
        }
        throw lastErr;
      })().catch((e) => {
        loaded[name] = null;
        throw e;
      });
    }
    await loaded[name];
    if (name === "xlsx") return window.XLSX;
    if (name === "mammoth") return window.mammoth;
    if (name === "pdf") {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      return window.pdfjsLib;
    }
  }

  // ---------- Normalizing (mirror of src/lib/normalize.ts) ----------

  const US_STATES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
    NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
    ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
    TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
    PR: "Puerto Rico",
  };
  const STATE_BY_NAME = {};
  for (const [code, name] of Object.entries(US_STATES)) STATE_BY_NAME[name.toLowerCase()] = code;
  const STATE_NAMES_LONGEST_FIRST = Object.entries(STATE_BY_NAME).sort((a, b) => b[0].length - a[0].length);

  function clean(value, max) {
    if (value === null || value === undefined) return null;
    const s = String(value).replace(/\s+/g, " ").trim();
    if (!s || /^(null|n\/a|na|none|-|undefined)$/i.test(s)) return null;
    return s.slice(0, max || 500);
  }

  function normalizePhone(value) {
    const s = clean(value, 60);
    if (!s) return null;
    let d = s.replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return s;
  }

  function normalizeEmail(value) {
    const s = clean(value, 200);
    if (!s) return null;
    const m = s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    return m ? m[0].toLowerCase() : null;
  }

  function normalizeState(value) {
    const s = clean(value, 60);
    if (!s) return null;
    const upper = s.toUpperCase().replace(/\./g, "");
    if (US_STATES[upper]) return upper;
    if (STATE_BY_NAME[s.toLowerCase()]) return STATE_BY_NAME[s.toLowerCase()];
    const code = s.match(/\b([A-Z]{2})\b(?:\s+\d{5})?\s*$/);
    if (code && US_STATES[code[1]]) return code[1];
    const lower = s.toLowerCase();
    for (const [name, c] of STATE_NAMES_LONGEST_FIRST) {
      if (new RegExp(`\\b${name}\\b`).test(lower)) return c;
    }
    return s;
  }

  function normalizeName(value) {
    const s = clean(value, 120);
    if (!s) return null;
    const letters = s.replace(/[^A-Za-z]/g, "");
    const shouting = letters.length > 1 && letters === letters.toUpperCase();
    const whisper = letters.length > 1 && letters === letters.toLowerCase();
    if (!shouting && !whisper) return s;
    return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
  }

  function normalizeLead(raw) {
    const phone = normalizePhone(raw.phone);
    const email = normalizeEmail(raw.email);
    let name = normalizeName(raw.name);
    if (!name && !phone && !email) return null;
    if (!name) name = email ? email.split("@")[0] : phone || "Unnamed lead";
    return {
      name,
      phone,
      email,
      state: normalizeState(raw.state),
      cdl: clean(raw.cdl, 200),
      medical_card: clean(raw.medical_card, 200),
      notes: clean(raw.notes, 2000),
    };
  }

  // ---------- Value detectors ----------

  const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const RE_PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

  const looksEmail = (v) => RE_EMAIL.test(v);
  function looksPhone(v) {
    if (!/^[\d\s()+.\-x#ext]{7,}$/i.test(v)) return false;
    const d = v.replace(/\D/g, "");
    return d.length === 10 || (d.length === 11 && d[0] === "1");
  }
  function looksState(v) {
    const t = v.trim();
    return Boolean(US_STATES[t.toUpperCase().replace(/\./g, "")] && t.length <= 3) || Boolean(STATE_BY_NAME[t.toLowerCase()]);
  }
  function looksLocation(v) {
    return /,\s*[A-Z]{2}\b/.test(v) || /\b\d{5}(-\d{4})?\b/.test(v);
  }
  function looksName(v) {
    const t = v.trim();
    if (t.length < 3 || t.length > 45 || /\d|@/.test(t)) return false;
    if (looksState(t)) return false;
    const words = t.split(/[\s,]+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) return false;
    return words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w));
  }
  const looksSingleWordName = (v) => /^[A-Za-z][A-Za-z'-]{1,20}$/.test(v.trim()) && !looksState(v);
  const looksCdl = (v) => /\bclass\s*[abc]\b|\bcdl\b|\bhazmat\b|\btanker\b|\bdoubles\b|^[abc]$/i.test(v.trim());
  const looksMedical = (v) => /medical|dot|physical|valid|expire|exp\b/i.test(v) || /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(v.trim());

  // ---------- Spreadsheet column matching ----------

  const FIELD_LABELS = {
    ignore: "— ignore —",
    name: "Name",
    first_name: "First name",
    last_name: "Last name",
    phone: "Phone",
    email: "Email",
    state: "State",
    location: "City / address (finds state)",
    cdl: "CDL",
    medical_card: "Medical card",
    notes: "Notes",
  };

  // Checked in order: the first rule that matches a header wins.
  const HEADER_RULES = [
    ["email", /e-?mail|gmail|\bmail\b/],
    ["medical_card", /medical|med\.? ?card|dot ?phys|physical|\bmec\b/],
    ["cdl", /\bcdl|licen[cs]e|endorse|\bclass\b/],
    ["notes", /company|carrier|employer|business|note|comment|remark|experience|\bexp\b|years|yrs|status|source|availab/],
    ["first_name", /first|fname|given/],
    ["last_name", /\blast\b|lname|surname|family/],
    ["phone", /phone|cell|mobile|\btel\b|telephone|number|\bph\b|whats ?app/],
    ["state", /\bstate\b|^st$|province|region/],
    ["location", /city|address|location|\bzip\b|postal|town/],
    ["name", /name|driver|candidate|applicant|contact|lead|employee|person|full/],
  ];

  function headerField(text) {
    const h = String(text || "").toLowerCase().trim();
    if (!h || h.length > 40) return null;
    for (const [field, re] of HEADER_RULES) if (re.test(h)) return field;
    return null;
  }

  function findHeaderRow(rows) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const cells = rows[i].filter((c) => String(c).trim());
      if (cells.length === 0) continue;
      let score = 0;
      for (const c of cells) {
        const v = String(c);
        if (looksEmail(v) || looksPhone(v)) {
          score -= 2;
          continue;
        }
        if (headerField(v)) score += 1;
      }
      const needed = cells.length <= 2 ? 1 : 2;
      if (score >= needed && score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    return best;
  }

  function contentScores(values) {
    const sample = values.filter((v) => v).slice(0, 80);
    const n = sample.length || 1;
    const ratio = (fn) => sample.filter(fn).length / n;
    return {
      email: ratio(looksEmail),
      phone: ratio(looksPhone),
      state: ratio(looksState),
      location: ratio(looksLocation),
      name: ratio(looksName),
      single: ratio(looksSingleWordName),
      cdl: ratio(looksCdl),
      medical_card: ratio(looksMedical),
      filled: sample.length,
    };
  }

  /** Decides which column is which. Returns an array of field keys, one per column. */
  function guessMapping(headers, dataRows) {
    const colCount = Math.max(headers.length, ...dataRows.map((r) => r.length), 0);
    const mapping = new Array(colCount).fill("ignore");
    const candidates = [];
    const byHeader = [];

    for (let c = 0; c < colCount; c++) {
      const values = dataRows.map((r) => String(r[c] ?? "").trim());
      const sc = contentScores(values);
      const hf = headerField(headers[c]);
      byHeader[c] = hf;
      if (sc.filled === 0) continue;
      const add = (field, score) => score > 0 && candidates.push({ field, col: c, score });
      // A header only counts fully when the values agree with it, so content
      // wins over a misleading header (e.g. "Contact" holding phone numbers).
      const hb = (field, ratio) => (hf === field ? (ratio >= 0.3 ? 2 : 0.4) : 0);
      add("email", sc.email * 3 + hb("email", sc.email));
      add("phone", sc.phone * 3 + hb("phone", sc.phone));
      add("state", sc.state * 3 + hb("state", sc.state + sc.location));
      add("name", sc.name * 2.5 + hb("name", sc.name + sc.single));
      add("first_name", (hf === "first_name" ? 2 : 0) + (hf === "first_name" ? sc.single : 0));
      add("last_name", (hf === "last_name" ? 2 : 0) + (hf === "last_name" ? sc.single : 0));
      add("cdl", sc.cdl * 2 + (hf === "cdl" ? 2 : 0));
      add("medical_card", (hf === "medical_card" ? 2.5 : 0) + (hf === "medical_card" ? sc.medical_card : 0));
      add("location", sc.location * 1.5 + (hf === "location" ? 2 : 0));
    }

    candidates.sort((a, b) => b.score - a.score);
    const usedField = new Set();
    for (const { field, col, score } of candidates) {
      if (score < 0.6) continue;
      if (mapping[col] !== "ignore") continue;
      if (usedField.has(field) && field !== "location") continue;
      mapping[col] = field;
      usedField.add(field);
    }

    // Name split across two columns without headers: two adjacent single-word columns.
    if (!usedField.has("name") && !usedField.has("first_name")) {
      for (let c = 0; c < colCount - 1; c++) {
        if (mapping[c] !== "ignore" || mapping[c + 1] !== "ignore") continue;
        const a = contentScores(dataRows.map((r) => String(r[c] ?? "")));
        const b = contentScores(dataRows.map((r) => String(r[c + 1] ?? "")));
        if (a.single > 0.7 && b.single > 0.7) {
          mapping[c] = "first_name";
          mapping[c + 1] = "last_name";
          break;
        }
      }
    }

    // Any other column that has a header goes into notes so nothing is lost
    // (except row-number / ID columns, which are just noise).
    for (let c = 0; c < colCount; c++) {
      const head = String(headers[c] ?? "").trim();
      if (mapping[c] === "notes" || (mapping[c] === "ignore" && head)) {
        const vals = dataRows.map((r) => String(r[c] ?? "").trim()).filter(Boolean);
        const isCounter = /^(#|no\.?|num|id|s\/?n|row|№)$/i.test(head) || (vals.length > 0 && vals.every((v) => /^\d{1,5}\.?$/.test(v)));
        if (isCounter) {
          mapping[c] = "ignore";
          continue;
        }
      }
      if (mapping[c] === "ignore" && head) {
        const hasData = dataRows.some((r) => String(r[c] ?? "").trim());
        if (hasData) mapping[c] = "notes";
      }
    }
    return mapping;
  }

  function rowsToLeads(headers, dataRows, mapping) {
    const leads = [];
    for (const row of dataRows) {
      const raw = { name: "", first: "", last: "", phone: "", email: "", state: "", location: "", cdl: "", medical_card: "", notes: [] };
      mapping.forEach((field, c) => {
        const v = String(row[c] ?? "").trim();
        if (!v || field === "ignore") return;
        if (field === "first_name") raw.first = v;
        else if (field === "last_name") raw.last = v;
        else if (field === "notes") raw.notes.push(headers[c] ? `${String(headers[c]).trim()}: ${v}` : v);
        else if (field === "location") raw.location = raw.location ? `${raw.location}, ${v}` : v;
        else raw[field] = raw[field] ? `${raw[field]} ${v}` : v;
      });
      const name = raw.name || [raw.first, raw.last].filter(Boolean).join(" ");
      let state = raw.state;
      if (!state && raw.location) {
        const s = normalizeState(raw.location);
        if (s && US_STATES[s]) state = s;
      }
      if (raw.location) raw.notes.unshift(raw.location);
      // A phone/email hiding in the "name" cell (e.g. "John Smith 555-123-4567").
      let cleanName = name;
      let phone = raw.phone;
      let email = raw.email;
      if (!phone && RE_PHONE.test(cleanName)) {
        phone = cleanName.match(RE_PHONE)[0];
        cleanName = cleanName.replace(RE_PHONE, " ");
      }
      if (!email && RE_EMAIL.test(cleanName)) {
        email = cleanName.match(RE_EMAIL)[0];
        cleanName = cleanName.replace(RE_EMAIL, " ");
      }
      const lead = normalizeLead({
        name: cleanName.replace(/[|,;:]+/g, " "),
        phone,
        email,
        state,
        cdl: raw.cdl,
        medical_card: raw.medical_card,
        notes: raw.notes.join("; "),
      });
      if (lead) leads.push(lead);
    }
    return leads;
  }

  function sheetGroup(label, rows) {
    rows = rows
      .map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c).trim())))
      .filter((r) => r.some((c) => c));
    if (rows.length === 0) return null;
    let h = findHeaderRow(rows);
    let headers = h >= 0 ? rows[h] : [];
    let dataRows = h >= 0 ? rows.slice(h + 1) : rows;
    let mapping = guessMapping(headers, dataRows);
    // Header row with unusual labels: the first row doesn't match the type of
    // its phone/email columns while the rows below do → it's a header.
    if (h < 0 && rows.length > 2) {
      const first = rows[0];
      const typed = mapping
        .map((f, c) => [f, c])
        .filter(([f]) => f === "phone" || f === "email");
      const mismatch = typed.length > 0 && typed.every(([f, c]) => {
        const v = String(first[c] ?? "");
        return f === "phone" ? !looksPhone(v) : !looksEmail(v);
      });
      if (mismatch) {
        h = 0;
        headers = first;
        dataRows = rows.slice(1);
        mapping = guessMapping(headers, dataRows);
      }
    }
    const leads = rowsToLeads(headers, dataRows, mapping);
    return { kind: "sheet", label, headers, dataRows, mapping, leads };
  }

  /** True when column matching clearly didn't work and the AI should read the sheet. */
  function sheetLooksMessy(group) {
    const m = group.mapping;
    const hasName = m.includes("name") || m.includes("first_name");
    const hasContact = m.includes("phone") || m.includes("email");
    if (!hasName || !hasContact) return true;
    const good = group.leads.filter((l) => l.name && (l.phone || l.email)).length;
    return good < group.dataRows.length * 0.4;
  }

  function sheetToText(rows) {
    return rows
      .map((r) => r.map((c) => String(c ?? "").trim()).filter(Boolean).join(" | "))
      .filter(Boolean)
      .join("\n");
  }

  // ---------- Pattern-based reader (fallback when AI isn't available) ----------

  function regexParseText(text) {
    const leads = [];
    for (const line of text.split(/\n+/)) {
      const email = (line.match(RE_EMAIL) || [])[0];
      const phone = (line.match(RE_PHONE) || [])[0];
      if (!email && !phone) continue;
      let rest = line.replace(RE_EMAIL, " ").replace(RE_PHONE, " ");
      let state = null;
      const code = rest.match(/\b([A-Z]{2})\b/g);
      if (code) state = code.find((c) => US_STATES[c]) || null;
      if (!state) {
        const lower = rest.toLowerCase();
        for (const [name, c] of STATE_NAMES_LONGEST_FIRST) if (new RegExp(`\\b${name}\\b`).test(lower)) { state = c; break; }
      }
      const cdl = (line.match(/class\s*[abc]\b/i) || [""])[0];
      rest = rest.replace(/class\s*[abc]\b|\bcdl\b|hazmat|tanker|doubles/gi, " ");
      if (state) rest = rest.replace(new RegExp(`\\b${state}\\b`), " ").replace(new RegExp(`\\b${US_STATES[state]}\\b`, "i"), " ");
      // The name is usually the first chunk before a comma / dash / pipe.
      const segment = rest.split(/[,|;\t]| - | – /).map((x) => x.trim()).find((x) => /[A-Za-z]{2}/.test(x)) || "";
      const words = segment.replace(/[^A-Za-z'.\- ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 || /^[A-Z]$/.test(w));
      const lead = normalizeLead({ name: words.slice(0, 3).join(" "), phone, email, state, cdl });
      if (lead) leads.push(lead);
    }
    return leads;
  }

  // ---------- AI calls ----------

  async function aiExtract(payload) {
    const res = await fetch("/api/import/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      window.location.href = "/login.html";
      throw new Error("Not signed in");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "AI request failed");
      err.status = res.status;
      throw err;
    }
    return (data.leads || []).map(normalizeLead).filter(Boolean);
  }

  function chunkText(text, size) {
    const lines = text.split("\n");
    const chunks = [];
    let cur = "";
    for (const line of lines) {
      if ((cur + "\n" + line).length > size && cur) {
        chunks.push(cur);
        cur = "";
      }
      cur = cur ? cur + "\n" + line : line.slice(0, size);
    }
    if (cur.trim()) chunks.push(cur);
    return chunks;
  }

  async function readTextSmart(text, onProgress) {
    text = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return { leads: [], note: "No text found." };
    const chunks = chunkText(text, 12000);
    const leads = [];
    let usedFallback = false;
    for (let i = 0; i < chunks.length; i++) {
      onProgress && onProgress(chunks.length > 1 ? `reading part ${i + 1} of ${chunks.length}` : "reading with AI");
      try {
        leads.push(...(await aiExtract({ text: chunks[i] })));
      } catch (e) {
        usedFallback = true;
        leads.push(...regexParseText(chunks[i]));
        if (e.status === 429) onProgress && onProgress(e.message);
      }
    }
    return { leads, note: usedFallback ? "AI unavailable — used basic pattern matching; please double-check." : "Read with AI" };
  }

  // ---------- Images ----------

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("This image format can't be opened in the browser. Save it as JPG or PNG."));
      img.src = src;
    });
  }

  /** Shrinks an image File/canvas to a JPEG data URL. */
  async function imageToDataUrl(source, maxSide, quality) {
    let img = source;
    let url;
    if (source instanceof Blob) {
      url = URL.createObjectURL(source);
      img = await loadImage(url);
    }
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (url) URL.revokeObjectURL(url);
    return canvas.toDataURL("image/jpeg", quality);
  }

  async function readImagesSmart(dataUrls, onProgress) {
    const leads = [];
    for (let i = 0; i < dataUrls.length; i++) {
      onProgress && onProgress(dataUrls.length > 1 ? `reading page ${i + 1} of ${dataUrls.length}` : "reading photo with AI");
      leads.push(...(await aiExtract({ image: dataUrls[i] })));
    }
    return { leads, note: "Read from image with AI — please double-check spelling" };
  }

  // ---------- PDF ----------

  async function pdfToTextOrImages(file, onProgress) {
    const pdfjs = await lib("pdf");
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = Math.min(doc.numPages, 40);
    let text = "";
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Rebuild lines from text positions so table rows stay together.
      const lines = new Map();
      for (const item of content.items) {
        if (!item.str) continue;
        const y = Math.round(item.transform[5] / 3);
        if (!lines.has(y)) lines.set(y, []);
        lines.get(y).push({ x: item.transform[4], s: item.str });
      }
      const ordered = [...lines.entries()].sort((a, b) => b[0] - a[0]);
      for (const [, items] of ordered) {
        text += items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" | ") + "\n";
      }
      text += "\n";
    }
    if (text.replace(/[\s|]/g, "").length >= 40 * pages) return { text };

    // Scanned PDF: no real text, so render pages to images for the AI.
    const images = [];
    const maxPages = Math.min(doc.numPages, 10);
    for (let p = 1; p <= maxPages; p++) {
      onProgress && onProgress(`scanning page ${p} of ${maxPages}`);
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, 1600 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.85));
    }
    return { images };
  }

  // ---------- File dispatcher ----------

  function ext(name) {
    const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
  }

  async function processFile(file, onProgress) {
    const e = ext(file.name);
    const type = file.type || "";

    if (["xlsx", "xlsm", "xls", "xlsb", "ods", "csv", "tsv", "numbers"].includes(e)) {
      onProgress("opening spreadsheet");
      const XLSX = await lib("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const groups = [];
      for (const sheetName of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: "", blankrows: false });
        const label = wb.SheetNames.length > 1 ? `${file.name} — ${sheetName}` : file.name;
        const g = sheetGroup(label, rows);
        if (!g) continue;
        if (sheetLooksMessy(g) && g.dataRows.length <= 400) {
          onProgress(`columns unclear in "${sheetName}", reading with AI`);
          const r = await readTextSmart(sheetToText(rows), onProgress);
          if (r.leads.length >= g.leads.length) {
            groups.push({ kind: "ai", label, leads: r.leads, note: r.note });
            continue;
          }
        }
        g.note = "Columns matched automatically — fix any below if needed";
        groups.push(g);
      }
      return groups;
    }

    if (e === "docx" || e === "odt") {
      onProgress("opening Word document");
      if (e === "odt") throw new Error("Save .odt files as .docx or PDF first.");
      const mammoth = await lib("mammoth");
      const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      const r = await readTextSmart(value, onProgress);
      return [{ kind: "ai", label: file.name, leads: r.leads, note: r.note }];
    }

    if (e === "doc") throw new Error("Old .doc files can't be read. Open it in Word and Save As .docx or PDF.");

    if (e === "pdf" || type === "application/pdf") {
      onProgress("opening PDF");
      const r = await pdfToTextOrImages(file, onProgress);
      const out = r.text ? await readTextSmart(r.text, onProgress) : await readImagesSmart(r.images, onProgress);
      return [{ kind: "ai", label: file.name, leads: out.leads, note: r.text ? out.note : "Scanned PDF read with AI — please double-check spelling" }];
    }

    if (type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "bmp"].includes(e)) {
      onProgress("preparing photo");
      const dataUrl = await imageToDataUrl(file, 2000, 0.85);
      const r = await readImagesSmart([dataUrl], onProgress);
      return [{ kind: "ai", label: file.name, leads: r.leads, note: r.note }];
    }

    if (["txt", "text", "md", "rtf", "json", "html", "htm", "vcf"].includes(e) || type.startsWith("text/")) {
      const r = await readTextSmart(await file.text(), onProgress);
      return [{ kind: "ai", label: file.name, leads: r.leads, note: r.note }];
    }

    throw new Error("This file type isn't supported. Use Excel, CSV, Word (.docx), PDF, or a photo.");
  }

  // ---------- UI ----------

  let session = null; // { groups: [...], status }

  function existingKeys() {
    const phones = new Set();
    const emails = new Set();
    for (const l of DD().state.leads) {
      const d = String(l.phone || "").replace(/\D/g, "").slice(-10);
      if (d.length === 10) phones.add(d);
      if (l.email) emails.add(l.email.toLowerCase());
    }
    return { phones, emails };
  }

  /** Marks duplicates (already in Driver Desk, or repeated within this import). */
  function flagRows() {
    const { phones, emails } = existingKeys();
    const seenP = new Set();
    const seenE = new Set();
    for (const g of session.groups) {
      for (const l of g.leads) {
        const d = String(l.phone || "").replace(/\D/g, "").slice(-10);
        const em = (l.email || "").toLowerCase();
        let dup = null;
        if ((d.length === 10 && phones.has(d)) || (em && emails.has(em))) dup = "Already in your leads";
        else if ((d.length === 10 && seenP.has(d)) || (em && seenE.has(em))) dup = "Repeated in this import";
        if (d.length === 10) seenP.add(d);
        if (em) seenE.add(em);
        const changed = l._dup !== dup;
        l._dup = dup;
        if (l._include === undefined || changed) l._include = !dup;
      }
    }
  }

  function open() {
    session = { groups: [], errors: [] };
    const { openModal, closeModal } = DD();
    openModal(
      `
      <h2>Import leads</h2>
      <p class="lead-meta" style="margin-top:-0.4em">Drop in any list of drivers — Excel, CSV, Word, PDF, or a photo/screenshot.
        Driver Desk figures out which part is the name, phone, state, email, CDL and medical card. You'll review everything before it's saved.</p>
      <label class="dropzone" id="imp-drop">
        <input type="file" id="imp-file" multiple
          accept=".xlsx,.xls,.xlsm,.xlsb,.csv,.tsv,.ods,.numbers,.docx,.doc,.pdf,.txt,image/*" />
        <div class="dropzone-icon">⬆</div>
        <div><strong>Click to choose files</strong> or drag them here</div>
        <div class="lead-meta">Excel · CSV · Word · PDF · JPG / PNG photos · text</div>
      </label>
      <div class="field" style="margin-top:1em"><label>…or paste a list here</label>
        <textarea id="imp-paste" rows="4" placeholder="John Smith  (555) 123-4567  TX  john@gmail.com  Class A"></textarea>
      </div>
      <div id="imp-progress"></div>
      <div style="display:flex; gap:0.5em; margin-top:1em;">
        <button class="btn btn-primary" id="imp-go">Find leads</button>
        <button class="btn btn-ghost" id="imp-cancel">Cancel</button>
      </div>
    `,
      { wide: true, sticky: true },
    );

    const fileInput = document.getElementById("imp-file");
    const drop = document.getElementById("imp-drop");
    let pending = [];

    const showPending = () => {
      document.getElementById("imp-progress").innerHTML = pending
        .map((f, i) => `<div class="imp-file" id="imp-f-${i}"><span>📄 ${DD().escapeHtml(f.name)}</span><span class="lead-meta" id="imp-s-${i}">ready</span></div>`)
        .join("");
    };
    fileInput.addEventListener("change", () => {
      pending = pending.concat([...fileInput.files]);
      fileInput.value = "";
      showPending();
    });
    ["dragenter", "dragover"].forEach((ev) =>
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add("over");
      }),
    );
    ["dragleave", "drop"].forEach((ev) =>
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.remove("over");
      }),
    );
    drop.addEventListener("drop", (e) => {
      pending = pending.concat([...(e.dataTransfer?.files || [])]);
      showPending();
    });

    document.getElementById("imp-cancel").addEventListener("click", closeModal);
    document.getElementById("imp-go").addEventListener("click", async (e) => {
      const pasted = document.getElementById("imp-paste").value.trim();
      if (!pending.length && !pasted) {
        alert("Choose a file or paste a list first.");
        return;
      }
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = "Reading…";
      for (let i = 0; i < pending.length; i++) {
        const status = (msg, cls) => {
          const el = document.getElementById(`imp-s-${i}`);
          if (el) {
            el.textContent = msg;
            el.className = "lead-meta " + (cls || "");
          }
        };
        try {
          const groups = await processFile(pending[i], (m) => status(m + "…"));
          session.groups.push(...groups);
          const n = groups.reduce((a, g) => a + g.leads.length, 0);
          status(`found ${n} lead${n === 1 ? "" : "s"}`, "ok-text");
        } catch (err) {
          console.error(err);
          status(err.message || "couldn't read this file", "error-text");
          session.errors.push(`${pending[i].name}: ${err.message}`);
        }
      }
      if (pasted) {
        const r = await readTextSmart(pasted);
        session.groups.push({ kind: "ai", label: "Pasted text", leads: r.leads, note: r.note });
      }
      const total = session.groups.reduce((a, g) => a + g.leads.length, 0);
      if (total === 0) {
        btn.disabled = false;
        btn.textContent = "Find leads";
        const prog = document.getElementById("imp-progress");
        prog.insertAdjacentHTML("beforeend", `<p class="error-text">No leads found. Check the file has names with phone numbers or emails.</p>`);
        pending = [];
        session.groups = [];
        return;
      }
      renderReview();
    });
  }

  const COLS = [
    ["name", "Name"],
    ["phone", "Phone"],
    ["state", "State"],
    ["email", "Email"],
    ["cdl", "CDL"],
    ["medical_card", "Medical card"],
    ["notes", "Notes"],
  ];

  function renderReview() {
    flagRows();
    const { escapeHtml, openModal } = DD();
    const all = session.groups.flatMap((g) => g.leads);
    const selected = all.filter((l) => l._include).length;
    const dups = all.filter((l) => l._dup).length;

    const groupsHtml = session.groups
      .map((g, gi) => {
        const mappingHtml =
          g.kind === "sheet"
            ? `<details class="imp-mapping"><summary>Columns (click to fix if something landed in the wrong place)</summary>
              <div class="imp-map-grid">
              ${g.mapping
                .map((field, c) => {
                  const sample = g.dataRows.map((r) => r[c]).find((v) => String(v ?? "").trim()) ?? "";
                  const head = String(g.headers[c] ?? "").trim() || `Column ${c + 1}`;
                  return `<label class="imp-map-item"><span><strong>${escapeHtml(head)}</strong><br/><span class="lead-meta">e.g. ${escapeHtml(String(sample).slice(0, 30))}</span></span>
                    <select data-g="${gi}" data-c="${c}" class="imp-map-select">
                      ${Object.entries(FIELD_LABELS).map(([k, lbl]) => `<option value="${k}" ${k === field ? "selected" : ""}>${lbl}</option>`).join("")}
                    </select></label>`;
                })
                .join("")}
              </div></details>`
            : "";
        const rows = g.leads
          .map(
            (l, li) => `<tr class="${l._include ? "" : "imp-off"}">
            <td><input type="checkbox" data-g="${gi}" data-l="${li}" class="imp-inc" ${l._include ? "checked" : ""} /></td>
            ${COLS.map(([k]) => `<td><input class="imp-cell" data-g="${gi}" data-l="${li}" data-k="${k}" value="${escapeHtml(l[k] || "")}" /></td>`).join("")}
            <td>${l._dup ? `<span class="doc-badge warn">${escapeHtml(l._dup)}</span>` : l.phone || l.email ? "" : `<span class="doc-badge warn">No phone/email</span>`}</td>
          </tr>`,
          )
          .join("");
        return `<div class="imp-group">
          <div class="imp-group-head"><strong>${escapeHtml(g.label)}</strong> <span class="lead-meta">· ${g.leads.length} found · ${escapeHtml(g.note || "")}</span></div>
          ${mappingHtml}
          ${g.leads.length ? `<div class="imp-table-wrap"><table class="imp-table"><thead><tr><th></th>${COLS.map(([, h]) => `<th>${h}</th>`).join("")}<th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="lead-meta">No leads in this one.</p>`}
        </div>`;
      })
      .join("");

    openModal(
      `
      <h2>Review ${all.length} lead${all.length === 1 ? "" : "s"}</h2>
      <p class="lead-meta" style="margin-top:-0.4em">Click any cell to fix it. Unchecked rows won't be imported${dups ? ` — ${dups} duplicate${dups === 1 ? " was" : "s were"} unchecked for you` : ""}.</p>
      ${session.errors.length ? `<p class="error-text">${session.errors.map(escapeHtml).join("<br/>")}</p>` : ""}
      ${groupsHtml}
      <div class="imp-footer">
        <button class="btn btn-primary" id="imp-save">Import ${selected} lead${selected === 1 ? "" : "s"}</button>
        <button class="btn btn-ghost" id="imp-back">Start over</button>
        <button class="btn btn-ghost" id="imp-close">Cancel</button>
        <span class="lead-meta" id="imp-save-status"></span>
      </div>
    `,
      { wide: true, sticky: true },
    );

    const root = document.getElementById("modal-root");
    root.querySelectorAll(".imp-inc").forEach((cb) =>
      cb.addEventListener("change", () => {
        const l = session.groups[cb.dataset.g].leads[cb.dataset.l];
        l._include = cb.checked;
        cb.closest("tr").classList.toggle("imp-off", !cb.checked);
        const n = session.groups.flatMap((g) => g.leads).filter((x) => x._include).length;
        document.getElementById("imp-save").textContent = `Import ${n} lead${n === 1 ? "" : "s"}`;
      }),
    );
    root.querySelectorAll(".imp-cell").forEach((inp) =>
      inp.addEventListener("change", () => {
        session.groups[inp.dataset.g].leads[inp.dataset.l][inp.dataset.k] = inp.value;
      }),
    );
    root.querySelectorAll(".imp-map-select").forEach((sel) =>
      sel.addEventListener("change", () => {
        const g = session.groups[sel.dataset.g];
        g.mapping[sel.dataset.c] = sel.value;
        g.leads = rowsToLeads(g.headers, g.dataRows, g.mapping);
        g.note = "Columns set by you";
        renderReview();
        const det = document.querySelectorAll(".imp-mapping")[sel.dataset.g];
        if (det) det.open = true;
      }),
    );
    document.getElementById("imp-close").addEventListener("click", DD().closeModal);
    document.getElementById("imp-back").addEventListener("click", open);
    document.getElementById("imp-save").addEventListener("click", saveAll);
  }

  async function saveAll(e) {
    const btn = e.target;
    const statusEl = document.getElementById("imp-save-status");
    const work = [];
    for (const g of session.groups) {
      const leads = g.leads
        .filter((l) => l._include)
        .map((l) => ({ name: l.name, phone: l.phone, email: l.email, state: l.state, cdl: l.cdl, medical_card: l.medical_card, notes: l.notes }));
      for (let i = 0; i < leads.length; i += 100) {
        work.push({ source: `Import: ${g.label}`.slice(0, 150), leads: leads.slice(i, i + 100) });
      }
    }
    const total = work.reduce((a, w) => a + w.leads.length, 0);
    if (!total) {
      alert("Nothing selected to import.");
      return;
    }
    btn.disabled = true;
    let done = 0;
    let imported = 0;
    try {
      for (const chunk of work) {
        statusEl.textContent = `Saving ${done} / ${total}…`;
        const r = await DD().apiPost("/leads/import", chunk);
        imported += r.imported;
        done += chunk.leads.length;
      }
    } catch (err) {
      btn.disabled = false;
      statusEl.textContent = "";
      alert(`Saved ${imported} leads, then hit an error: ${err.message}. You can try again — duplicates will be flagged.`);
      await DD().reloadLeads();
      return;
    }
    DD().closeModal();
    await DD().reloadLeads();
    toast(`✅ Imported ${imported} lead${imported === 1 ? "" : "s"}`);
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  window.DDImport = {
    open,
    imageToDataUrl,
    toast,
    // exposed for tests
    _test: { sheetGroup, guessMapping, rowsToLeads, regexParseText, normalizeLead, sheetLooksMessy, findHeaderRow },
  };
})();
