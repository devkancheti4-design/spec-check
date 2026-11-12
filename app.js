(() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem("speccheck:" + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("speccheck:" + k, v); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem("speccheck:" + k); } catch { /* private mode */ } },
  };
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  let q = null;                 // current question
  let previewRun = null;        // run id of the preview iframe
  let testRun = null;           // run id of the test iframe
  let results = [];
  let total = 0;
  let watchdog = null;
  let errLine = null;
  let saveTimer = null;

  // ---------------------------------------------------------------- editor
  let editor;
  if (window.CodeMirror) {
    editor = CodeMirror($("editorHost"), {
      mode: "javascript",
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      lineWrapping: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      extraKeys: {
        "Ctrl-Enter": () => run(),
        "Cmd-Enter": () => run(),
        "Ctrl-/": "toggleComment",
        "Cmd-/": "toggleComment",
        Tab: (cm) => (cm.somethingSelected() ? cm.indentSelection("add") : cm.replaceSelection("  ")),
      },
    });
  } else {
    // CDN unavailable: plain textarea with the same tiny API
    const ta = document.createElement("textarea");
    ta.className = "fallback";
    ta.spellcheck = false;
    $("editorHost").appendChild(ta);
    const handlers = [];
    ta.addEventListener("input", () => handlers.forEach((h) => h()));
    editor = {
      getValue: () => ta.value,
      setValue: (v) => { ta.value = v; },
      on: (_, h) => handlers.push(h),
      addLineClass() {}, removeLineClass() {}, refresh() {}, clearHistory() {}, focus: () => ta.focus(),
    };
  }
  editor.on("change", () => {
    clearErrLine();
    $("saveState").textContent = "editing…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (q) store.set("code:" + q.id, editor.getValue());
      $("saveState").textContent = "saved";
    }, 300);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
  });

  function clearErrLine() {
    if (errLine != null) { editor.removeLineClass(errLine, "background", "err-line"); errLine = null; }
  }
  function markErrLine(line) {
    clearErrLine();
    if (line && window.CodeMirror) { errLine = line - 1; editor.addLineClass(errLine, "background", "err-line"); }
  }

  // ---------------------------------------------------------- iframe docs
  const NO_PAGE = `<div style="font:14px system-ui,sans-serif;color:#6b7c76;display:grid;place-items:center;height:100vh;margin:0;background:#f6f8f7;text-align:center;padding:0 16px">This question has no page.<br>Results and console.log output appear below.</div>`;

  // JSON that is safe to drop inside a <script> block
  const js = (v) => JSON.stringify(v ?? null).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\!--");

  // first "mock: <data>" line of a custom question = what fetch() returns in the preview
  function previewMockExpr(checks) {
    for (const raw of String(checks || "").split(/\r?\n/)) {
      const m = raw.trim().match(/^mock\s*:\s*(.*)$/i);
      if (m && !/^(fail|none|status\b)/i.test(m[1].trim())) return m[1].trim();
    }
    return null;
  }

  function testsScript(question) {
    if (question.custom) return `speccheckChecks(window.__t, ${js(question.checks)});`;
    return `(${question.tests.toString()})(window.__t);`;
  }

  function buildDoc(question, code, runId, withTests) {
    const cfg = `{runId:${js(runId)},mock:${js(question.mock)},mockExpr:${js(question.custom ? previewMockExpr(question.checks) : null)},offset:__OFFSET__,timeout:3000}`;
    let pre =
      `<!doctype html><html><head><meta charset="utf-8"><style>${question.css || "body{margin:0}"}</style></head><body>\n` +
      `${question.html || NO_PAGE}\n` +
      `<script>(${speccheckHarness.toString()})(${cfg});\n${speccheckChecks.toString()}<\/script>\n<script>\n`;
    const offset = pre.split("\n").length - 1; // user line 1 = document line offset+1
    pre = pre.replace("__OFFSET__", String(offset));
    const safe = code.replace(/<\/(script)/gi, "<\\/$1");
    const tail = withTests
      ? `\n<\/script>\n<script>\ntry { ${testsScript(question)} } catch (e) { console.error(e); }\nwindow.__t.start();\n<\/script></body></html>`
      : `\n<\/script>\n<script>window.__ready();<\/script></body></html>`;
    return pre + safe + tail;
  }

  // -------------------------------------------------------------- running
  function renderPreview(code) {
    previewRun = uid();
    $("console").innerHTML = "";
    consoleCount = 0;
    updateConsoleCount();
    $("preview").srcdoc = buildDoc(q, code, previewRun, false);
  }

  function run() {
    if (!q) return;
    const code = editor.getValue();
    store.set("code:" + q.id, code);
    $("saveState").textContent = "saved";
    clearErrLine();
    renderPreview(code);

    results = [];
    total = 0;
    $("specList").innerHTML = "";
    $("dots").innerHTML = "";
    $("loadError").hidden = true;
    $("loadError").textContent = "";
    setSummary("running", "Running specs…");
    $("runBtn").disabled = true;
    $("runBtn").textContent = "Running…";

    testRun = uid();
    $("testFrame").srcdoc = buildDoc(q, code, testRun, true);
    clearTimeout(watchdog);
    watchdog = setTimeout(() => finish(true), 45000);
  }

  function finish(timedOut) {
    clearTimeout(watchdog);
    $("runBtn").disabled = false;
    $("runBtn").textContent = "▶ Run tests";
    if (timedOut) {
      testRun = null;
      setSummary("bad", "Tests did not finish. Is there an infinite loop?");
      return;
    }
    testRun = null;
    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    setSummary(
      failed ? "bad" : "ok",
      `${results.length} spec${results.length === 1 ? "" : "s"}, ${failed} failure${failed === 1 ? "" : "s"}`
    );
    const score = results.length ? Math.round((passed / results.length) * 10) : 0;
    const best = Math.max(score, Number(store.get("best:" + q.id) || 0));
    store.set("best:" + q.id, String(best));
    showScore(score, best);
    renderList();
  }

  function setSummary(kind, text) {
    $("summary").className = "summary " + kind;
    $("summaryText").textContent = text;
  }

  function showScore(score, best) {
    const card = $("scoreCard");
    $("scoreNow").textContent = score == null ? "–" : score;
    $("bestScore").textContent = best == null ? "–" : best + "/10";
    if (score == null) {
      card.className = "score-card idle";
      $("scoreMsg").innerHTML = "Write your answer, then press <b>Run tests</b>.";
    } else if (score === 10) {
      card.className = "score-card full";
      $("scoreMsg").textContent = "Well done! Every spec passes.";
    } else if (score >= 6) {
      card.className = "score-card pass";
      $("scoreMsg").textContent = "Passed (60% or more). Fix the red specs to get 10/10.";
    } else {
      card.className = "score-card low";
      $("scoreMsg").textContent = "Not passing yet. You need 60% or more. Read the red messages below.";
    }
  }

  function addSpec(r) {
    results.push(r);
    const dot = document.createElement("span");
    dot.className = r.ok ? "p" : "f";
    dot.textContent = r.ok ? "•" : "×";
    $("dots").appendChild(dot);
    setSummary("running", `Running specs… ${results.length}/${total || "?"}`);
  }

  function renderList() {
    const list = $("specList");
    list.innerHTML = "";
    // failures first, like Jasmine's "Failures" view, then passes
    const ordered = [...results.filter((r) => !r.ok), ...results.filter((r) => r.ok)];
    for (const r of ordered) {
      const li = document.createElement("li");
      li.className = "spec " + (r.ok ? "ok" : "fail");
      const name = document.createElement("div");
      name.className = "name";
      name.innerHTML = `<span class="ic">${r.ok ? "✓" : "✗"}</span>`;
      const span = document.createElement("span");
      span.textContent = r.name;
      name.appendChild(span);
      li.appendChild(name);
      if (!r.ok) {
        const msg = document.createElement("div");
        msg.className = "msg";
        msg.textContent = r.msg;
        li.appendChild(msg);
      }
      list.appendChild(li);
    }
  }

  // -------------------------------------------------------------- console
  let consoleCount = 0;
  function updateConsoleCount() {
    $("consoleCount").textContent = consoleCount ? consoleCount + (consoleCount === 1 ? " message" : " messages") : "";
    if (!consoleCount) $("console").innerHTML = '<div class="row empty">console.log output from your code shows here</div>';
  }
  function addConsole({ level, text, line }) {
    if (!consoleCount) $("console").innerHTML = "";
    consoleCount++;
    const row = document.createElement("div");
    row.className = "row " + level;
    row.textContent = (line ? `app.js:${line}  ` : "") + text;
    $("console").appendChild(row);
    $("console").scrollTop = $("console").scrollHeight;
    updateConsoleCount();
  }
  $("clearConsole").onclick = () => { consoleCount = 0; $("console").innerHTML = ""; updateConsoleCount(); };

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || typeof d.speccheck !== "string") return;
    if (d.speccheck === previewRun) {
      if (d.type === "console" || d.type === "loaderror") addConsole(d.data);
      if (d.type === "loaderror" && d.data.line) markErrLine(d.data.line);
      return;
    }
    if (d.speccheck !== testRun) return;
    if (d.type === "count") total = d.data.total;
    else if (d.type === "spec") addSpec(d.data);
    else if (d.type === "done") finish(false);
    else if (d.type === "loaderror") {
      const box = $("loadError");
      box.hidden = false;
      box.textContent += (box.textContent ? "\n" : "Your code threw an error while loading:\n") +
        (d.data.line ? `line ${d.data.line}: ` : "") + d.data.text;
      if (d.data.line) markErrLine(d.data.line);
    }
  });

  // ------------------------------------------------------------ questions
  function bestBadge(id) {
    const b = store.get("best:" + id);
    if (b == null) return '<span class="badge">–</span>';
    const n = Number(b);
    return `<span class="badge ${n === 10 ? "full" : n >= 6 ? "pass" : ""}">${n}/10</span>`;
  }

  // ---- user-added questions (saved in this browser) ----
  function loadCustom() {
    try {
      const list = JSON.parse(store.get("custom") || "[]");
      return Array.isArray(list) ? list.filter((x) => x && x.id && x.title).map((x) => ({ ...x, custom: true })) : [];
    } catch { return []; }
  }
  function saveCustom(list) {
    store.set("custom", JSON.stringify(list.map(({ custom, ...rest }) => rest)));
  }
  const allQuestions = () => QUESTIONS.concat(loadCustom());
  const countChecks = (text) =>
    String(text || "").split(/\r?\n/).map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("//") && !/^mock\s*:/i.test(l)).length;

  function renderNav() {
    $("qList").innerHTML = "";
    $("qSelect").innerHTML = "";
    allQuestions().forEach((item, i) => {
      const b = document.createElement("button");
      b.className = "q-item" + (q && q.id === item.id ? " active" : "");
      b.innerHTML = `<span class="t"><small></small><span></span></span>${bestBadge(item.id)}`;
      b.querySelector("small").textContent = item.topic || (item.custom ? "Your question" : "");
      b.querySelector(".t > span").textContent = `${i + 1}. ${item.title}`;
      if (item.custom) b.querySelector(".t > span").insertAdjacentHTML("beforeend", '<span class="yours">YOURS</span>');
      b.onclick = () => select(item.id);
      $("qList").appendChild(b);
      const o = document.createElement("option");
      o.value = item.id;
      o.textContent = `${i + 1}. ${item.title}${item.custom ? " (yours)" : ""}`;
      $("qSelect").appendChild(o);
    });
    if (q) $("qSelect").value = q.id;
  }
  $("qSelect").onchange = (e) => select(e.target.value);

  function select(id) {
    const list = allQuestions();
    const next = list.find((x) => x.id === id) || list[0];
    q = next;
    try { history.replaceState(null, "", "#" + q.id); } catch { /* sandboxed */ }
    $("qTopic").textContent = q.topic || (q.custom ? "Your question" : "");
    $("qTitle").textContent = q.title;
    if (q.custom) {
      const t = $("qTask");
      t.innerHTML = "";
      const p = document.createElement("div");
      p.className = "task-plain";
      p.textContent = q.task || "Read the TODO comments in app.js and write the code. Then press Run tests.";
      t.appendChild(p);
      $("checksView").textContent = q.checks;
      $("checksCount").textContent = countChecks(q.checks);
    } else {
      $("qTask").innerHTML = q.task;
    }
    $("customActions").hidden = !q.custom;
    $("checksBox").hidden = !q.custom;
    $("solutionBtn").hidden = !q.solution;
    const saved = store.get("code:" + q.id);
    editor.setValue(saved != null ? saved : q.starter);
    editor.clearHistory();
    $("saveState").textContent = "saved";
    testRun = null;
    clearTimeout(watchdog);
    $("runBtn").disabled = false;
    $("runBtn").textContent = "▶ Run tests";
    results = [];
    $("specList").innerHTML = "";
    $("dots").innerHTML = "";
    $("loadError").hidden = true;
    setSummary("idle", "No run yet");
    const best = store.get("best:" + q.id);
    showScore(null, best == null ? null : Number(best));
    renderNav();
    renderPreview(editor.getValue());
    setTimeout(() => editor.refresh(), 0);
  }

  // ---------------------------------------------------------------- buttons
  $("runBtn").onclick = run;
  $("resetBtn").onclick = () => {
    if (confirm("Replace your code with the starter code? Your current answer will be lost.")) {
      editor.setValue(q.starter);
      store.set("code:" + q.id, q.starter);
      renderPreview(q.starter);
    }
  };
  const dlg = $("solutionDlg");
  $("solutionBtn").onclick = () => {
    $("solutionCode").textContent = q.solution;
    dlg.showModal();
  };
  $("closeSolution").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  $("copySolution").onclick = async () => {
    try { await navigator.clipboard.writeText(q.solution); $("copySolution").textContent = "Copied"; }
    catch { $("copySolution").textContent = "Select & copy"; }
    setTimeout(() => ($("copySolution").textContent = "Copy"), 1500);
  };
  $("useSolution").onclick = () => {
    if (confirm("Replace your code with the reference solution?")) {
      editor.setValue(q.solution);
      dlg.close();
    }
  };

  // ------------------------------------------------- add / edit a question
  const addDlg = $("addDlg");
  const F = (id) => $(id);
  let editingId = null;

  function toast(text) {
    const el = $("toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.hidden = true), 2600);
  }

  function openAdd(existing) {
    editingId = existing ? existing.id : null;
    $("addTitle").textContent = existing ? "Edit your question" : "Add your own question";
    $("saveAdd").textContent = existing ? "Save changes" : "Save question";
    F("fTitle").value = existing ? existing.title : "";
    F("fTopic").value = existing ? existing.topic || "" : "";
    F("fTask").value = existing ? existing.task || "" : "";
    F("fStarter").value = existing ? existing.starter : "";
    F("fChecks").value = existing ? existing.checks : "";
    F("fHtml").value = existing ? existing.html || "" : "";
    F("fSolution").value = existing ? existing.solution || "" : "";
    $("formError").hidden = true;
    addDlg.showModal();
    F("fTitle").focus();
  }

  function suggestChecks(code) {
    const found = [];
    const seen = new Set();
    const skip = /^(if|for|while|switch|catch|function|return|fetch|setTimeout|resolve|then|named)$/;
    const add = (name, args) => {
      if (seen.has(name) || skip.test(name)) return;
      seen.add(name);
      found.push({ name, args: (args || "").trim() });
    };
    const patterns = [
      /TODO[^:\n]*:\s*([A-Za-z_$][\w$]*)\s*\(([^)\n]*)\)/g,
      /\bnamed\s+([A-Za-z_$][\w$]*)\s*\(([^)\n]*)\)/g,
      /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)\n]*)\)/g,
    ];
    for (const re of patterns) { let m; while ((m = re.exec(code))) add(m[1], m[2]); }

    const out = [
      "# One check per line:  code => expected result",
      "# Lines starting with # are notes. Turn each example into a real case.",
    ];
    if (/\bfetch\s*\(/.test(code)) {
      out.push("", "# fetch() is faked. Set what it returns for the checks below:", '# mock: [{"id": 1, "title": "First"}, {"id": 2, "title": "Second"}]');
    }
    if (!found.length) {
      out.push("", "# No function names found in the TODOs. Example:", "# myFunction(2, 3) => 5");
    }
    for (const f of found) {
      out.push("", `# ${f.name}(${f.args})`, `typeof ${f.name} => "function"`, `# ${f.name}(${f.args ? "…" : ""}) => expected result`);
    }
    return out.join("\n");
  }

  $("addBtn").onclick = () => openAdd(null);
  $("closeAdd").onclick = () => addDlg.close();
  $("cancelAdd").onclick = () => addDlg.close();
  $("suggestBtn").onclick = () => {
    const code = F("fStarter").value;
    if (!code.trim()) {
      $("formError").textContent = "Paste the question code first, then press “Start from the TODOs”.";
      $("formError").hidden = false;
      return;
    }
    $("formError").hidden = true;
    const s = suggestChecks(code);
    const cur = F("fChecks").value.trim();
    F("fChecks").value = cur ? cur + "\n\n" + s : s;
    F("fChecks").focus();
  };

  $("addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
      title: F("fTitle").value.trim(),
      topic: F("fTopic").value.trim(),
      task: F("fTask").value.trim(),
      starter: F("fStarter").value.replace(/\s+$/, "") + "\n",
      checks: F("fChecks").value.replace(/\s+$/, ""),
      html: F("fHtml").value.trim(),
      solution: F("fSolution").value.trim() ? F("fSolution").value.replace(/\s+$/, "") + "\n" : "",
    };
    const problems = [];
    if (!data.title) problems.push("Give the question a title.");
    if (!data.starter.trim()) problems.push("Paste the question code.");
    if (!countChecks(data.checks))
      problems.push("Add at least one check line, like  doubleAsync(5) => 10  (lines starting with # don’t count).");
    if (problems.length) {
      $("formError").textContent = problems.join(" ");
      $("formError").hidden = false;
      return;
    }
    const list = loadCustom();
    let id = editingId;
    if (id) {
      const i = list.findIndex((x) => x.id === id);
      const old = list[i];
      if (old && store.get("code:" + id) === old.starter) store.del("code:" + id); // untouched → show new starter
      if (old && old.checks !== data.checks) store.del("best:" + id);              // new checks → old best no longer meaningful
      list[i] = { ...old, ...data };
    } else {
      id = "my-" + uid().slice(0, 10);
      list.push({ id, ...data });
    }
    saveCustom(list);
    addDlg.close();
    select(id);
    toast(editingId ? "Question updated." : "Question saved. Write the answer in app.js, then press Run tests.");
  });

  $("editQ").onclick = () => q && q.custom && openAdd(q);
  $("deleteQ").onclick = () => {
    if (!q || !q.custom) return;
    if (!confirm(`Delete “${q.title}” and your answer to it? This can’t be undone.`)) return;
    saveCustom(loadCustom().filter((x) => x.id !== q.id));
    store.del("code:" + q.id);
    store.del("best:" + q.id);
    select(QUESTIONS[0].id);
    toast("Question deleted.");
  };

  // ---- share a question as a link (the question travels inside the URL) ----
  const toB64u = (s) => {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const fromB64u = (s) => {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  };

  $("shareQ").onclick = async () => {
    if (!q || !q.custom) return;
    const { title, topic, task, starter, checks, html, solution } = q;
    const url = location.origin + location.pathname + "#import=" + toB64u(JSON.stringify({ v: 1, title, topic, task, starter, checks, html, solution }));
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied. Anyone who opens it gets this question.");
    } catch {
      prompt("Copy this link:", url);
    }
  };

  function importFromHash() {
    const m = location.hash.match(/^#import=([\w-]+)/);
    if (!m) return null;
    let data;
    try { data = JSON.parse(fromB64u(m[1])); } catch { toast("That share link is broken or incomplete."); return null; }
    const str = (v) => (typeof v === "string" ? v : "");
    data = { title: str(data.title).slice(0, 80), topic: str(data.topic).slice(0, 80), task: str(data.task), starter: str(data.starter), checks: str(data.checks), html: str(data.html), solution: str(data.solution) };
    if (!data.title || !data.starter || !countChecks(data.checks)) { toast("That share link has no usable question."); return null; }
    const list = loadCustom();
    const same = list.find((x) => x.title === data.title && x.starter === data.starter && x.checks === data.checks);
    if (same) return same.id;
    const id = "my-" + uid().slice(0, 10);
    list.push({ id, ...data });
    saveCustom(list);
    setTimeout(() => toast(`Shared question “${data.title}” added to your list.`), 0);
    return id;
  }

  // ------------------------------------------------------------------ boot
  updateConsoleCount();
  const imported = importFromHash();
  select(imported || decodeURIComponent(location.hash.slice(1)));
})();
