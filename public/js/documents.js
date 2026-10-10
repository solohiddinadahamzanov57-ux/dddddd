/*
 * Driver Desk — CDL / medical card photos for a lead.
 * Photos are shrunk in the browser before upload (keeps them small and fast);
 * PDFs up to ~1.4 MB are stored as-is.
 */
(function () {
  const DD = () => window.DD;

  const SECTIONS = [
    ["cdl", "CDL (front & back)"],
    ["medical", "Medical card"],
    ["other", "Other documents"],
  ];
  const MAX_BASE64 = 1_900_000;

  let current = null; // { lead, documents }

  async function open(lead) {
    current = { lead, documents: [] };
    render(true);
    try {
      const data = await DD().apiGet(`/leads/${lead.id}/documents`);
      current.documents = data.documents;
      render(false);
    } catch (err) {
      alert(err.message);
    }
  }

  function docUrl(doc) {
    return `/api/leads/${current.lead.id}/documents/${doc.id}`;
  }

  function render(loading) {
    const { escapeHtml, openModal } = DD();
    const lead = current.lead;
    const body = loading
      ? `<p class="lead-meta">Loading…</p>`
      : SECTIONS.map(([kind, label]) => {
          const docs = current.documents.filter((d) => d.kind === kind);
          return `<div class="doc-section">
            <div class="doc-section-head"><strong>${label}</strong>
              <label class="btn btn-ghost btn-sm doc-add">+ Add photo
                <input type="file" accept="image/*,application/pdf" data-kind="${kind}" class="doc-input" multiple hidden />
              </label>
            </div>
            <div class="doc-grid">
              ${docs.length === 0 ? `<div class="lead-meta">No ${kind === "other" ? "documents" : label.toLowerCase()} yet.</div>` : ""}
              ${docs
                .map(
                  (d) => `<div class="doc-thumb">
                    <a href="${docUrl(d)}" target="_blank" rel="noopener">
                      ${d.mime_type.startsWith("image/") ? `<img src="${docUrl(d)}" alt="${escapeHtml(d.file_name || label)}" loading="lazy" />` : `<div class="doc-pdf">📄 PDF</div>`}
                    </a>
                    <button class="doc-del" data-id="${d.id}" title="Delete">✕</button>
                  </div>`,
                )
                .join("")}
            </div>
          </div>`;
        }).join("");

    openModal(`
      <h2>Documents — ${escapeHtml(lead.name)}</h2>
      <div class="field" style="flex-direction:row; gap:0.75em; flex-wrap:wrap;">
        <div style="flex:1; min-width:140px"><label class="lead-meta">CDL info</label>
          <input id="doc-cdl" value="${escapeHtml(lead.cdl || "")}" placeholder="Class A, 3 yrs, Hazmat" style="width:100%" /></div>
        <div style="flex:1; min-width:140px"><label class="lead-meta">Medical card</label>
          <input id="doc-med" value="${escapeHtml(lead.medical_card || "")}" placeholder="Valid until 05/2027" style="width:100%" /></div>
      </div>
      ${body}
      <div id="doc-status" class="lead-meta"></div>
      <div style="display:flex; gap:0.5em; margin-top:1em;">
        <button class="btn btn-primary" id="doc-done">Done</button>
      </div>
    `);

    document.querySelectorAll(".doc-input").forEach((inp) =>
      inp.addEventListener("change", async () => {
        const files = [...inp.files];
        inp.value = "";
        for (const f of files) await upload(f, inp.dataset.kind);
      }),
    );
    document.querySelectorAll(".doc-del").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this document?")) return;
        try {
          await DD().apiDelete(`/leads/${current.lead.id}/documents/${btn.dataset.id}`);
          current.documents = current.documents.filter((d) => d.id !== btn.dataset.id);
          render(false);
        } catch (err) {
          alert(err.message);
        }
      }),
    );
    document.getElementById("doc-done").addEventListener("click", async () => {
      const cdl = document.getElementById("doc-cdl").value.trim();
      const med = document.getElementById("doc-med").value.trim();
      try {
        if (cdl !== (current.lead.cdl || "") || med !== (current.lead.medical_card || "")) {
          await DD().api(`/leads/${current.lead.id}`, {
            method: "PATCH",
            body: JSON.stringify({ cdl, medical_card: med }),
          });
        }
      } catch (err) {
        alert(err.message);
        return;
      }
      DD().closeModal();
      await DD().reloadLeads();
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
      r.onerror = () => reject(new Error("Couldn't read the file."));
      r.readAsDataURL(blob);
    });
  }

  async function upload(file, kind) {
    const status = document.getElementById("doc-status");
    const setStatus = (m) => status && (status.textContent = m);
    try {
      setStatus(`Uploading ${file.name}…`);
      let mime = file.type || "";
      let data;
      if (mime === "application/pdf" || /\.pdf$/i.test(file.name)) {
        mime = "application/pdf";
        data = await blobToBase64(file);
        if (data.length > MAX_BASE64) throw new Error("This PDF is too big (max about 1.4 MB). Take a photo instead.");
      } else {
        const shrink = window.DDImport.imageToDataUrl;
        let url = await shrink(file, 1800, 0.85);
        if (url.length > MAX_BASE64) url = await shrink(file, 1300, 0.7);
        mime = "image/jpeg";
        data = url.replace(/^data:[^,]*,/, "");
      }
      const res = await DD().apiPost(`/leads/${current.lead.id}/documents`, {
        kind,
        file_name: file.name,
        mime_type: mime,
        data,
      });
      current.documents.push(res.document);
      render(false);
      const st = document.getElementById("doc-status");
      if (st) st.textContent = `✅ ${file.name} saved`;
    } catch (err) {
      setStatus("");
      alert(err.message || "Upload failed");
    }
  }

  window.DDDocs = { open };
})();
