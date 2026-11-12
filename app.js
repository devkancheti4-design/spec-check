(() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem("speccheck:" + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("speccheck:" + k, v); } catch { /* private mode */ } },
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

  function buildDoc(question, code, runId, withTests) {
    const cfg = `{runId:${JSON.stringify(runId)},mock:${JSON.stringify(question.mock ?? null)},offset:__OFFSET__,timeout:3000}`;
    let pre =
      `<!doctype html><html><head><meta charset="utf-8"><style>${question.css || "body{margin:0}"}</style></head><body>\n` +
      `${question.html || NO_PAGE}\n` +
      `<script>(${speccheckHarness.toString()})(${cfg});<\/script>\n<script>\n`;
    const offset = pre.split("\n").length - 1; // user line 1 = document line offset+1
    pre = pre.replace("__OFFSET__", String(offset));
    const safe = code.replace(/<\/(script)/gi, "<\\/$1");
    const tail = withTests
      ? `\n<\/script>\n<script>\ntry { (${question.tests.toString()})(window.__t); } catch (e) { console.error(e); }\nwindow.__t.start();\n<\/script></body></html>`
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

  function renderNav() {
    $("qList").innerHTML = "";
    $("qSelect").innerHTML = "";
    QUESTIONS.forEach((item, i) => {
      const b = document.createElement("button");
      b.className = "q-item" + (q && q.id === item.id ? " active" : "");
      b.innerHTML = `<span class="t"><small></small><span></span></span>${bestBadge(item.id)}`;
      b.querySelector("small").textContent = item.topic;
      b.querySelector(".t > span").textContent = `${i + 1}. ${item.title}`;
      b.onclick = () => select(item.id);
      $("qList").appendChild(b);
      const o = document.createElement("option");
      o.value = item.id;
      o.textContent = `${i + 1}. ${item.title}`;
      $("qSelect").appendChild(o);
    });
    if (q) $("qSelect").value = q.id;
  }
  $("qSelect").onchange = (e) => select(e.target.value);

  function select(id) {
    const next = QUESTIONS.find((x) => x.id === id) || QUESTIONS[0];
    q = next;
    try { history.replaceState(null, "", "#" + q.id); } catch { /* sandboxed */ }
    $("qTopic").textContent = q.topic;
    $("qTitle").textContent = q.title;
    $("qTask").innerHTML = q.task;
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

  // ------------------------------------------------------------------ boot
  updateConsoleCount();
  select(decodeURIComponent(location.hash.slice(1)));
})();
