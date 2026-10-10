(function () {
  const state = {
    leads: [],
    customFields: [],
    infoTemplates: [],
    messageTemplates: [],
    filters: { q: "", status: "", due: false },
  };

  const LEAD_STATUSES = [
    "new",
    "contacted",
    "qualified",
    "scheduled",
    "hired",
    "not_interested",
    "lost",
  ];

  // ---------- API helpers ----------

  async function api(path, options) {
    const res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.status === 401) {
      window.location.href = "/login.html";
      throw new Error("Not signed in");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  const apiGet = (path) => api(path);
  const apiPost = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });
  const apiPatch = (path, body) => api(path, { method: "PATCH", body: JSON.stringify(body) });
  const apiDelete = (path) => api(path, { method: "DELETE" });

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }

  function fmtStatus(s) {
    return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // ---------- Modal ----------

  const modalRoot = document.getElementById("modal-root");

  function openModal(html, opts) {
    const wide = opts && opts.wide ? " modal-wide" : "";
    modalRoot.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal${wide}">${html}</div></div>`;
    document.getElementById("modal-backdrop").addEventListener("click", (e) => {
      if (e.target.id === "modal-backdrop" && !(opts && opts.sticky)) closeModal();
    });
  }

  function closeModal() {
    modalRoot.innerHTML = "";
  }

  /** Wraps a submit handler so a failed API call shows an alert instead of hanging silently. */
  function onSubmit(form, handler) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await handler(e);
      } catch (err) {
        alert(err.message || "Something went wrong. Please try again.");
      }
    });
  }

  /** Same as onSubmit, for click-triggered actions (delete buttons, etc). */
  function onClick(el, handler) {
    el.addEventListener("click", async (e) => {
      try {
        await handler(e);
      } catch (err) {
        alert(err.message || "Something went wrong. Please try again.");
      }
    });
  }

  // ---------- Load everything ----------

  async function loadAll() {
    const [me, summary, leadsData, fieldsData, infoData, msgData] = await Promise.all([
      apiGet("/me"),
      apiGet("/me/summary"),
      apiGet("/leads"),
      apiGet("/custom-fields"),
      apiGet("/info-templates"),
      apiGet("/message-templates"),
    ]);
    document.getElementById("user-email").textContent = me.email;
    state.leads = leadsData.leads;
    state.customFields = leadsData.customFields;
    state.infoTemplates = infoData.templates;
    state.messageTemplates = msgData.templates;
    renderSummary(summary);
    renderLeads();
    renderInfoTemplates();
    renderMessageTemplates();
    renderFields();
  }

  async function reloadLeads() {
    const leadsData = await apiGet("/leads");
    state.leads = leadsData.leads;
    state.customFields = leadsData.customFields;
    const summary = await apiGet("/me/summary");
    renderSummary(summary);
    renderLeads();
  }

  // ---------- Summary ----------

  function renderSummary(summary) {
    document.getElementById("summary-total").textContent = summary.totalLeads;
    document.getElementById("summary-due").textContent = summary.dueTodayCount;
    document.getElementById("dash-fill").style.width = `${summary.completeness.percent}%`;
    document.getElementById("dash-label").textContent = `${summary.completeness.percent}%`;
  }

  // ---------- Leads ----------

  function filteredLeads() {
    let list = state.leads;
    if (state.filters.status) list = list.filter((l) => l.status === state.filters.status);
    if (state.filters.due) {
      const endOfToday = new Date();
      endOfToday.setUTCHours(23, 59, 59, 999);
      list = list.filter((l) => l.next_follow_up_at && l.next_follow_up_at <= endOfToday.toISOString());
    }
    if (state.filters.q) {
      const q = state.filters.q.toLowerCase();
      list = list.filter((l) =>
        [l.name, l.phone, l.email, l.company, l.state, l.cdl, l.notes].filter(Boolean).some((v) => v.toLowerCase().includes(q)),
      );
    }
    return list;
  }

  function renderLeads() {
    const list = filteredLeads();
    const el = document.getElementById("leads-list");
    if (list.length === 0) {
      el.innerHTML = `<div class="empty-state panel">No leads match. <br/>
        <button class="btn btn-primary" style="margin-top:1em" id="empty-add-btn">+ Add your first lead</button>
        <button class="btn btn-accent" style="margin-top:1em" id="empty-import-btn">⬆ Import leads</button></div>`;
      document.getElementById("empty-add-btn")?.addEventListener("click", () => openLeadForm());
      document.getElementById("empty-import-btn")?.addEventListener("click", () => window.DDImport && window.DDImport.open());
      return;
    }
    el.innerHTML = list
      .map((lead) => {
        const pct = lead.completeness.percent;
        const docs = lead.documents || {};
        const docTotal = (docs.cdl || 0) + (docs.medical || 0) + (docs.other || 0);
        const badges = [
          lead.cdl || docs.cdl ? `<span class="doc-badge ${docs.cdl ? "ok" : ""}" title="${docs.cdl ? "CDL photo on file" : "No CDL photo yet"}">CDL${lead.cdl ? ": " + escapeHtml(lead.cdl) : ""}${docs.cdl ? " 📷" : ""}</span>` : "",
          lead.medical_card || docs.medical ? `<span class="doc-badge ${docs.medical ? "ok" : ""}" title="${docs.medical ? "Medical card photo on file" : "No medical card photo yet"}">Med${lead.medical_card ? ": " + escapeHtml(lead.medical_card) : ""}${docs.medical ? " 📷" : ""}</span>` : "",
        ].join("");
        return `
        <div class="panel lead-card" data-id="${lead.id}">
          <div class="lead-card-top">
            <div>
              <div class="lead-name">${escapeHtml(lead.name)}</div>
              <div class="lead-meta">${[lead.phone, lead.email, lead.state, lead.company].filter(Boolean).map(escapeHtml).join(" · ")}</div>
              ${badges ? `<div class="doc-badges">${badges}</div>` : ""}
              ${lead.next_follow_up_at ? `<div class="lead-meta">Follow up: ${fmtDate(lead.next_follow_up_at)}</div>` : ""}
            </div>
            <span class="status-pill status-${lead.status}">${fmtStatus(lead.status)}</span>
          </div>
          <div class="dash-bar">
            <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${pct}%"></div></div>
            <div class="dash-bar-label">${pct}% complete</div>
          </div>
          <div class="lead-actions">
            ${lead.phone ? `<a class="btn btn-ghost btn-sm" href="tel:${escapeHtml(lead.phone)}">📞 Call</a>` : ""}
            ${lead.phone ? `<button class="btn btn-ghost btn-sm" data-action="text" data-id="${lead.id}">💬 Text</button>` : ""}
            <button class="btn btn-ghost btn-sm" data-action="log-call" data-id="${lead.id}">📝 Log call</button>
            <button class="btn btn-ghost btn-sm" data-action="docs" data-id="${lead.id}">📎 CDL / Med photos${docTotal ? ` (${docTotal})` : ""}</button>
            <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${lead.id}">Edit</button>
            <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${lead.id}">Delete</button>
          </div>
        </div>`;
      })
      .join("");
  }

  onClick(document.getElementById("leads-list"), async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const lead = state.leads.find((l) => l.id === id);
    const action = btn.dataset.action;
    if (action === "edit") openLeadForm(lead);
    if (action === "delete") {
      if (confirm(`Delete ${lead.name}? This can't be undone.`)) {
        await apiDelete(`/leads/${id}`);
        await reloadLeads();
      }
    }
    if (action === "log-call") openCallLogForm(lead);
    if (action === "text") openTextComposer(lead);
    if (action === "docs" && window.DDDocs) window.DDDocs.open(lead);
  });

  function customFieldInputs(values) {
    if (state.customFields.length === 0) return "";
    return `
      <h3 style="font-size:1rem; margin-top: 1.2em;">Custom fields</h3>
      ${state.customFields
        .map((f) => {
          const val = values?.[f.field_key] ?? "";
          if (f.field_type === "select") {
            const options = JSON.parse(f.options || "[]");
            return `<div class="field"><label>${escapeHtml(f.label)}</label>
              <select name="cf_${f.field_key}">
                <option value="">—</option>
                ${options.map((o) => `<option value="${escapeHtml(o)}" ${o === val ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}
              </select></div>`;
          }
          const type = f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text";
          return `<div class="field"><label>${escapeHtml(f.label)}</label>
            <input name="cf_${f.field_key}" type="${type}" value="${escapeHtml(val)}" /></div>`;
        })
        .join("")}
    `;
  }

  function openLeadForm(lead) {
    const isEdit = Boolean(lead);
    openModal(`
      <h2>${isEdit ? "Edit lead" : "Add lead"}</h2>
      <form id="lead-form">
        <div class="field"><label>Name *</label><input name="name" required value="${escapeHtml(lead?.name)}" /></div>
        <div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(lead?.phone)}" /></div>
        <div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(lead?.email)}" /></div>
        <div class="field"><label>State</label><input name="state" maxlength="40" placeholder="TX" value="${escapeHtml(lead?.state)}" /></div>
        <div class="field"><label>CDL</label><input name="cdl" placeholder="Class A, 3 yrs, Hazmat" value="${escapeHtml(lead?.cdl)}" /></div>
        <div class="field"><label>Medical card</label><input name="medical_card" placeholder="Valid until 05/2027" value="${escapeHtml(lead?.medical_card)}" /></div>
        <div class="field"><label>Company</label><input name="company" value="${escapeHtml(lead?.company)}" /></div>
        <div class="field"><label>Status</label>
          <select name="status">
            ${LEAD_STATUSES.map((s) => `<option value="${s}" ${lead?.status === s ? "selected" : ""}>${fmtStatus(s)}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Source</label><input name="source" value="${escapeHtml(lead?.source)}" /></div>
        <div class="field"><label>Follow up on</label><input name="next_follow_up_at" type="date" value="${lead?.next_follow_up_at ? lead.next_follow_up_at.slice(0, 10) : ""}" /></div>
        <div class="field"><label>Notes</label><textarea name="notes" rows="3">${escapeHtml(lead?.notes)}</textarea></div>
        ${customFieldInputs(lead ? JSON.parse(lead.custom_data || "{}") : {})}
        <div style="display:flex; gap:0.5em; margin-top:1em;">
          <button type="submit" class="btn btn-primary">${isEdit ? "Save" : "Add lead"}</button>
          <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
          ${isEdit ? `<button type="button" class="btn btn-ghost" id="lead-docs-btn">📎 CDL / Med photos</button>` : ""}
        </div>
      </form>
    `);
    document.getElementById("cancel-btn").addEventListener("click", closeModal);
    document.getElementById("lead-docs-btn")?.addEventListener("click", () => window.DDDocs && window.DDDocs.open(lead));
    onSubmit(document.getElementById("lead-form"), async (e) => {
      const form = new FormData(e.target);
      const customData = {};
      for (const f of state.customFields) {
        const v = form.get(`cf_${f.field_key}`);
        if (v) customData[f.field_key] = v;
      }
      const payload = {
        name: form.get("name"),
        phone: form.get("phone"),
        email: form.get("email"),
        company: form.get("company"),
        state: form.get("state"),
        cdl: form.get("cdl"),
        medical_card: form.get("medical_card"),
        status: form.get("status"),
        source: form.get("source"),
        notes: form.get("notes"),
        next_follow_up_at: form.get("next_follow_up_at") || null,
        custom_data: customData,
      };
      if (isEdit) await apiPatch(`/leads/${lead.id}`, payload);
      else await apiPost("/leads", payload);
      closeModal();
      await reloadLeads();
    });
  }

  function openCallLogForm(lead) {
    openModal(`
      <h2>Log a call — ${escapeHtml(lead.name)}</h2>
      <form id="call-form">
        <div class="field"><label>Outcome</label>
          <select name="outcome">
            <option value="connected">Connected</option>
            <option value="voicemail">Left voicemail</option>
            <option value="no_answer">No answer</option>
            <option value="scheduled">Scheduled interview</option>
            <option value="not_interested">Not interested</option>
          </select>
        </div>
        <div class="field"><label>Note</label><textarea name="note" rows="3"></textarea></div>
        <div style="display:flex; gap:0.5em;">
          <button type="submit" class="btn btn-primary">Save call</button>
          <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
        </div>
      </form>
    `);
    document.getElementById("cancel-btn").addEventListener("click", closeModal);
    onSubmit(document.getElementById("call-form"), async (e) => {
      const form = new FormData(e.target);
      await apiPost(`/leads/${lead.id}/calls`, {
        outcome: form.get("outcome"),
        note: form.get("note"),
      });
      closeModal();
      await reloadLeads();
    });
  }

  function fillTemplate(body, lead) {
    const customData = JSON.parse(lead.custom_data || "{}");
    const values = { ...customData, name: lead.name, company: lead.company, phone: lead.phone, email: lead.email, state: lead.state, cdl: lead.cdl, status: fmtStatus(lead.status) };
    return body.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
  }

  function openTextComposer(lead) {
    const smsTemplates = state.messageTemplates.filter((t) => t.channel === "sms");
    openModal(`
      <h2>Text — ${escapeHtml(lead.name)}</h2>
      ${smsTemplates.length ? `
        <div class="field"><label>Start from a template</label>
          <select id="template-pick">
            <option value="">— blank —</option>
            ${smsTemplates.map((t) => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join("")}
          </select>
        </div>` : ""}
      <div class="field"><label>Message</label><textarea id="sms-body" rows="4"></textarea></div>
      <div style="display:flex; gap:0.5em;">
        <a class="btn btn-primary" id="send-sms-link">Open in Messages</a>
        <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
      </div>
    `);
    document.getElementById("cancel-btn").addEventListener("click", closeModal);
    const bodyEl = document.getElementById("sms-body");
    const pick = document.getElementById("template-pick");
    if (pick) {
      pick.addEventListener("change", () => {
        const tpl = smsTemplates.find((t) => t.id === pick.value);
        bodyEl.value = tpl ? fillTemplate(tpl.body, lead) : "";
      });
    }
    document.getElementById("send-sms-link").addEventListener("click", (e) => {
      e.preventDefault();
      const url = `sms:${encodeURIComponent(lead.phone)}?body=${encodeURIComponent(bodyEl.value)}`;
      window.location.href = url;
    });
  }

  // ---------- Info templates ----------

  function renderInfoTemplates() {
    const el = document.getElementById("info-templates-list");
    if (state.infoTemplates.length === 0) {
      el.innerHTML = `<div class="empty-state panel">No info templates yet.</div>`;
      return;
    }
    el.innerHTML = state.infoTemplates
      .map(
        (t) => `
      <div class="panel template-item" data-id="${t.id}">
        <div><strong>${escapeHtml(t.title)}</strong><div class="lead-meta">${escapeHtml(t.body)}</div></div>
        <div class="lead-actions">
          <button class="btn btn-ghost btn-sm" data-action="edit-info" data-id="${t.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-action="delete-info" data-id="${t.id}">Delete</button>
        </div>
      </div>`,
      )
      .join("");
  }

  function openInfoTemplateForm(tpl) {
    openModal(`
      <h2>${tpl ? "Edit" : "Add"} info template</h2>
      <form id="info-tpl-form">
        <div class="field"><label>Title</label><input name="title" required value="${escapeHtml(tpl?.title)}" /></div>
        <div class="field"><label>Body</label><textarea name="body" rows="4" required>${escapeHtml(tpl?.body)}</textarea></div>
        <div style="display:flex; gap:0.5em;">
          <button type="submit" class="btn btn-primary">Save</button>
          <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
        </div>
      </form>
    `);
    document.getElementById("cancel-btn").addEventListener("click", closeModal);
    onSubmit(document.getElementById("info-tpl-form"), async (e) => {
      const form = new FormData(e.target);
      const payload = { title: form.get("title"), body: form.get("body") };
      if (tpl) await apiPatch(`/info-templates/${tpl.id}`, payload);
      else await apiPost("/info-templates", payload);
      closeModal();
      const data = await apiGet("/info-templates");
      state.infoTemplates = data.templates;
      renderInfoTemplates();
    });
  }

  onClick(document.getElementById("info-templates-list"), async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const tpl = state.infoTemplates.find((t) => t.id === btn.dataset.id);
    if (btn.dataset.action === "edit-info") openInfoTemplateForm(tpl);
    if (btn.dataset.action === "delete-info") {
      if (confirm(`Delete "${tpl.title}"?`)) {
        await apiDelete(`/info-templates/${tpl.id}`);
        const data = await apiGet("/info-templates");
        state.infoTemplates = data.templates;
        renderInfoTemplates();
      }
    }
  });

  document.getElementById("add-info-template-btn").addEventListener("click", () => openInfoTemplateForm());

  // ---------- Message templates ----------

  function renderMessageTemplates() {
    const el = document.getElementById("message-templates-list");
    if (state.messageTemplates.length === 0) {
      el.innerHTML = `<div class="empty-state panel">No message templates yet. Use {name}, {company}, or any custom field key as a placeholder.</div>`;
      return;
    }
    el.innerHTML = state.messageTemplates
      .map(
        (t) => `
      <div class="panel template-item" data-id="${t.id}">
        <div><strong>${escapeHtml(t.title)}</strong> <span class="status-pill status-new">${t.channel}</span>
          <div class="lead-meta">${escapeHtml(t.body)}</div></div>
        <div class="lead-actions">
          <button class="btn btn-ghost btn-sm" data-action="edit-msg" data-id="${t.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-action="delete-msg" data-id="${t.id}">Delete</button>
        </div>
      </div>`,
      )
      .join("");
  }

  function openMessageTemplateForm(tpl) {
    openModal(`
      <h2>${tpl ? "Edit" : "Add"} message template</h2>
      <form id="msg-tpl-form">
        <div class="field"><label>Title</label><input name="title" required value="${escapeHtml(tpl?.title)}" /></div>
        <div class="field"><label>Channel</label>
          <select name="channel">
            <option value="sms" ${tpl?.channel !== "email" ? "selected" : ""}>Text (SMS)</option>
            <option value="email" ${tpl?.channel === "email" ? "selected" : ""}>Email</option>
          </select>
        </div>
        <div class="field"><label>Body — use {name}, {company}, or a custom field key</label>
          <textarea name="body" rows="4" required>${escapeHtml(tpl?.body)}</textarea></div>
        <div style="display:flex; gap:0.5em;">
          <button type="submit" class="btn btn-primary">Save</button>
          <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
        </div>
      </form>
    `);
    document.getElementById("cancel-btn").addEventListener("click", closeModal);
    onSubmit(document.getElementById("msg-tpl-form"), async (e) => {
      const form = new FormData(e.target);
      const payload = { title: form.get("title"), channel: form.get("channel"), body: form.get("body") };
      if (tpl) await apiPatch(`/message-templates/${tpl.id}`, payload);
      else await apiPost("/message-templates", payload);
      closeModal();
      const data = await apiGet("/message-templates");
      state.messageTemplates = data.templates;
      renderMessageTemplates();
    });
  }

  onClick(document.getElementById("message-templates-list"), async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const tpl = state.messageTemplates.find((t) => t.id === btn.dataset.id);
    if (btn.dataset.action === "edit-msg") openMessageTemplateForm(tpl);
    if (btn.dataset.action === "delete-msg") {
      if (confirm(`Delete "${tpl.title}"?`)) {
        await apiDelete(`/message-templates/${tpl.id}`);
        const data = await apiGet("/message-templates");
        state.messageTemplates = data.templates;
        renderMessageTemplates();
      }
    }
  });

  document.getElementById("add-message-template-btn").addEventListener("click", () => openMessageTemplateForm());

  // ---------- Custom fields ----------

  function renderFields() {
    const el = document.getElementById("fields-list");
    if (state.customFields.length === 0) {
      el.innerHTML = `<div class="empty-state panel">No custom fields yet.</div>`;
      return;
    }
    el.innerHTML = state.customFields
      .map(
        (f) => `
      <div class="panel template-item" data-id="${f.id}">
        <div><strong>${escapeHtml(f.label)}</strong> <span class="lead-meta">(${f.field_type})</span></div>
        <button class="btn btn-ghost btn-sm" data-action="delete-field" data-id="${f.id}">Delete</button>
      </div>`,
      )
      .join("");
  }

  function openFieldForm() {
    openModal(`
      <h2>Add custom field</h2>
      <form id="field-form">
        <div class="field"><label>Label (shown on the lead form)</label><input name="label" required /></div>
        <div class="field"><label>Field key (no spaces, used internally)</label><input name="field_key" required pattern="[a-z0-9_]+" placeholder="cdl_class" /></div>
        <div class="field"><label>Type</label>
          <select name="field_type">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="select">Select (comma-separated options below)</option>
          </select>
        </div>
        <div class="field"><label>Options (for Select type only)</label><input name="options" placeholder="Class A, Class B" /></div>
        <div style="display:flex; gap:0.5em;">
          <button type="submit" class="btn btn-primary">Add field</button>
          <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
        </div>
      </form>
    `);
    document.getElementById("cancel-btn").addEventListener("click", closeModal);
    onSubmit(document.getElementById("field-form"), async (e) => {
      const form = new FormData(e.target);
      const options = form.get("options");
      await apiPost("/custom-fields", {
        label: form.get("label"),
        field_key: form.get("field_key"),
        field_type: form.get("field_type"),
        options: options ? options.split(",").map((s) => s.trim()).filter(Boolean) : null,
      });
      closeModal();
      const data = await apiGet("/custom-fields");
      state.customFields = data.customFields;
      renderFields();
    });
  }

  onClick(document.getElementById("fields-list"), async (e) => {
    const btn = e.target.closest("button[data-action='delete-field']");
    if (!btn) return;
    const field = state.customFields.find((f) => f.id === btn.dataset.id);
    if (confirm(`Delete custom field "${field.label}"? Existing lead data for it is kept but hidden.`)) {
      await apiDelete(`/custom-fields/${field.id}`);
      const data = await apiGet("/custom-fields");
      state.customFields = data.customFields;
      renderFields();
    }
  });

  document.getElementById("add-field-btn").addEventListener("click", openFieldForm);

  // ---------- Toolbar + tabs ----------

  document.getElementById("add-lead-btn").addEventListener("click", () => openLeadForm());
  document.getElementById("import-leads-btn").addEventListener("click", () => window.DDImport && window.DDImport.open());
  document.getElementById("search-input").addEventListener("input", (e) => {
    state.filters.q = e.target.value;
    renderLeads();
  });
  document.getElementById("status-filter").addEventListener("change", (e) => {
    state.filters.status = e.target.value;
    renderLeads();
  });
  document.getElementById("due-today-chip").addEventListener("click", (e) => {
    state.filters.due = !state.filters.due;
    e.target.classList.toggle("active", state.filters.due);
    renderLeads();
  });

  document.querySelectorAll(".tabs > .tab-btn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs > .tab-btn[data-tab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      ["leads", "templates", "fields"].forEach((tab) => {
        document.getElementById(`tab-${tab}`).classList.toggle("hidden", tab !== btn.dataset.tab);
      });
    });
  });

  document.querySelectorAll(".tab-btn[data-subtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn[data-subtab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      ["info", "message"].forEach((sub) => {
        document.getElementById(`subtab-${sub}`).classList.toggle("hidden", sub !== btn.dataset.subtab);
      });
    });
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/auth/sign-out", { method: "POST" });
    window.location.href = "/login.html";
  });

  // Shared helpers for import.js and documents.js.
  window.DD = { state, api, apiGet, apiPost, apiDelete, escapeHtml, openModal, closeModal, reloadLeads, onClick };

  loadAll().catch((err) => {
    console.error(err);
  });
})();
