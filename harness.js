// Runs INSIDE the sandboxed iframe. It is injected with Function.prototype.toString,
// so it must be fully self-contained (no references to anything outside this function).
function speccheckHarness(cfg) {
  // cfg = { runId, mock, offset, timeout }
  const send = (type, data) => {
    try { parent.postMessage({ speccheck: cfg.runId, type, data }, "*"); } catch (e) { /* ignore */ }
  };
  let loading = true;

  // ---------- formatting ----------
  function fmt(v) {
    try {
      if (v instanceof Error) return v.name + ": " + v.message;
      if (typeof v === "string") return JSON.stringify(v);
      if (typeof v === "function") return "function " + (v.name || "(anonymous)");
      if (typeof v === "undefined") return "undefined";
      if (typeof v === "symbol" || typeof v === "bigint") return String(v);
      if (v instanceof Promise) return "Promise";
      if (typeof Element !== "undefined" && v instanceof Element) return "<" + v.tagName.toLowerCase() + ">";
      const s = JSON.stringify(v);
      if (s === undefined) return String(v);
      return s.length > 220 ? s.slice(0, 220) + "…" : s;
    } catch (e) {
      return String(v);
    }
  }
  const clone = (d) => (d === undefined ? undefined : JSON.parse(JSON.stringify(d)));

  // ---------- console capture ----------
  ["log", "info", "warn", "error"].forEach((level) => {
    const orig = console[level];
    console[level] = function (...args) {
      orig.apply(console, args);
      send("console", { level, text: args.map((a) => (typeof a === "string" ? a : fmt(a))).join(" ") });
    };
  });
  window.addEventListener("error", (e) => {
    const raw = e.error && e.error.name ? e.error.name + ": " + e.error.message : String(e.message || "Error");
    const text = raw.replace(/^Uncaught\s+/, "");
    const line = e.lineno ? e.lineno - cfg.offset : null;
    send(loading ? "loaderror" : "console", { level: "error", text, line: line > 0 ? line : null });
  });
  window.addEventListener("unhandledrejection", (e) => {
    send("console", { level: "error", text: "Uncaught (in promise) " + fmt(e.reason) });
  });

  // ---------- fake fetch ----------
  function respond(data, opts = {}) {
    const status = opts.status != null ? opts.status : opts.ok === false ? 500 : 200;
    const ok = opts.ok != null ? opts.ok : status >= 200 && status < 300;
    const res = {
      ok,
      status,
      statusText: ok ? "OK" : "Error",
      url: opts.url || "",
      headers: new Map([["content-type", "application/json"]]),
      json: () =>
        opts.jsonDelay
          ? new Promise((r) => setTimeout(() => r(clone(data)), opts.jsonDelay))
          : Promise.resolve(clone(data)),
      text: () => Promise.resolve(JSON.stringify(data)),
      clone: () => res,
    };
    return res;
  }
  function mockFetch(handler) {
    const spy = function (...args) {
      spy.calls.push(args);
      try {
        return Promise.resolve(handler(...args));
      } catch (err) {
        return Promise.reject(err);
      }
    };
    spy.calls = [];
    window.fetch = spy;
    return spy;
  }
  let previewData = cfg.mock == null ? [] : cfg.mock;
  if (cfg.mockExpr) {
    try { previewData = new Function("return (" + cfg.mockExpr + ")")(); } catch (e) { /* bad mock line: keep [] */ }
  }
  const defaultFetch = (url) => Promise.resolve(respond(previewData, { url: String(url) }));
  window.fetch = defaultFetch;

  // ---------- assertions ----------
  class Fail extends Error {}
  class Timeout extends Error {}

  function eq(a, b) {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && eq(a[k], b[k]));
  }

  function expect(actual, label) {
    const build = (neg) => {
      const check = (pass, what, expected, showExpected = true) => {
        if (Boolean(pass) === neg) {
          const msg =
            "Expected " + fmt(actual) + (neg ? " not " : " ") + what + (showExpected ? " " + fmt(expected) : "");
          throw new Fail((label ? label + " — " : "") + msg);
        }
      };
      return {
        toBe: (x) => check(Object.is(actual, x), "to be", x),
        toEqual: (x) => check(eq(actual, x), "to equal", x),
        toBeNull: () => check(actual === null, "to be null", null, false),
        toBeUndefined: () => check(actual === undefined, "to be undefined", null, false),
        toBeDefined: () => check(actual !== undefined, "to be defined", null, false),
        toBeTruthy: () => check(!!actual, "to be truthy", null, false),
        toBeFalsy: () => check(!actual, "to be falsy", null, false),
        toContain: (x) =>
          check(actual != null && typeof actual.includes === "function" && actual.includes(x), "to contain", x),
        toHaveLength: (n) => check(actual != null && actual.length === n, "to have length", n),
        toBeGreaterThan: (n) => check(actual > n, "to be greater than", n),
        toBeGreaterThanOrEqual: (n) => check(actual >= n, "to be at least", n),
        toBeLessThan: (n) => check(actual < n, "to be less than", n),
        toBeInstanceOf: (C) => check(actual instanceof C, "to be an instance of", C),
        toMatch: (re) => check(typeof actual === "string" && new RegExp(re).test(actual), "to match", String(re)),
      };
    };
    const m = build(false);
    m.not = build(true);
    return m;
  }

  function expectAsync(promise, label) {
    const pre = label ? label + " — " : "";
    const settle = () =>
      Promise.resolve(promise).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error })
      );
    const isPromise = promise && typeof promise.then === "function";
    const needPromise = () => {
      if (!isPromise) throw new Fail(pre + "Expected a Promise but got " + fmt(promise));
    };
    return {
      async toBeResolved() {
        needPromise();
        const r = await settle();
        if (!r.ok) throw new Fail(pre + "Expected the Promise to resolve, but it rejected with " + fmt(r.error));
        return r.value;
      },
      async toBeResolvedTo(x) {
        needPromise();
        const r = await settle();
        if (!r.ok) throw new Fail(pre + "Expected the Promise to resolve to " + fmt(x) + ", but it rejected with " + fmt(r.error));
        if (!eq(r.value, x)) throw new Fail(pre + "Expected the Promise to resolve to " + fmt(x) + ", but it resolved to " + fmt(r.value));
      },
      async toBeRejected() {
        needPromise();
        const r = await settle();
        if (r.ok) throw new Fail(pre + "Expected the Promise to reject, but it resolved to " + fmt(r.value));
        return r.error;
      },
      async toBeRejectedWithError(message) {
        needPromise();
        const r = await settle();
        if (r.ok) throw new Fail(pre + "Expected the Promise to reject with an Error, but it resolved to " + fmt(r.value));
        if (!(r.error instanceof Error)) throw new Fail(pre + "Expected it to reject with an Error object, but it rejected with " + fmt(r.error));
        if (message != null && r.error.message !== message)
          throw new Fail(pre + "Expected the Error message to be " + fmt(message) + ", but it was " + fmt(r.error.message));
        return r.error;
      },
    };
  }

  // ---------- runner ----------
  const specs = [];
  const it = (name, fn) => specs.push({ name, fn });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const flush = () => sleep(0);

  async function start() {
    loading = false;
    send("count", { total: specs.length });
    await sleep(80); // let any auto-run (e.g. loadFeed() at the bottom) settle
    for (const s of specs) {
      window.fetch = defaultFetch;
      let ok = true, msg = "";
      const t0 = performance.now();
      try {
        await Promise.race([
          Promise.resolve().then(() => s.fn()),
          sleep(cfg.timeout || 3000).then(() => { throw new Timeout(); }),
        ]);
      } catch (e) {
        ok = false;
        if (e instanceof Fail) msg = e.message;
        else if (e instanceof Timeout)
          msg = "Timed out after " + (cfg.timeout || 3000) / 1000 + "s — a Promise never settled (missing resolve / return / await?)";
        else msg = e && e.name ? e.name + ": " + e.message : "Threw " + fmt(e);
      }
      send("spec", { name: s.name, ok, msg, ms: Math.round(performance.now() - t0) });
    }
    window.fetch = defaultFetch;
    send("done", {});
  }

  window.__t = { it, expect, expectAsync, mockFetch, respond, flush, sleep, start, fmt };
  window.__ready = () => { loading = false; send("ready", {}); };
}

// Turns the plain-text "checks" of a user-added question into specs. Also injected
// with toString, so it must stay self-contained. One check per line:
//   code => expected            e.g.  doubleAsync(5) => 10      (Promises are awaited)
//   code => throws ["message"]  e.g.  rejectWith("boom") => throws "boom"
//   mock: <data> | mock: fail | mock: status 404 [data] | mock: none
//   # comment
function speccheckChecks(t, text) {
  const { it, expect, mockFetch, respond, fmt } = t;
  const value = (src) => new Function("return (" + src + ")")();
  const compile = (src) => new Function("return (async () => (\n" + src + "\n))();");
  let mock = null;

  function applyMock(m) {
    if (!m || /^none$/i.test(m)) return;
    if (/^fail$/i.test(m)) { mockFetch(() => Promise.reject(new TypeError("Failed to fetch"))); return; }
    const st = m.match(/^status\s+(\d{3})\s*(.*)$/i);
    if (st) { const d = st[2] ? value(st[2]) : {}; mockFetch(() => respond(d, { status: Number(st[1]) })); return; }
    const d = value(m);
    mockFetch(() => respond(d));
  }

  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) return;
    const mm = line.match(/^mock\s*:\s*(.*)$/i);
    if (mm) { mock = mm[1].trim(); return; }

    let idx = line.lastIndexOf(" => "), sep = 4;
    const alt = line.lastIndexOf("→");
    if (alt > idx) { idx = alt; sep = 1; }
    if (idx < 0) {
      it(line, () => { throw new Error('Check line ' + (i + 1) + ' needs " => " between the code and the expected result.'); });
      return;
    }
    const lhs = line.slice(0, idx).trim();
    const rhs = line.slice(idx + sep).trim();
    const useMock = mock;

    it(line, async () => {
      let run;
      try { run = compile(lhs); } catch (e) { throw new Error("This check is not valid JavaScript: " + e.message); }
      try { applyMock(useMock); } catch (e) { throw new Error("The mock: line above this check is not valid JavaScript: " + e.message); }
      const wantThrow = rhs.match(/^(throws|rejects)\b\s*(.*)$/i);
      let got, err, threw = false;
      try { got = await run(); } catch (e) { threw = true; err = e; }
      if (wantThrow) {
        if (!threw) throw new Error("Expected it to throw / reject, but it gave " + fmt(got));
        // a missing function is not the error the question asks for
        if (err instanceof ReferenceError) throw err;
        if (wantThrow[2]) {
          const msg = value(wantThrow[2]);
          const actual = err && err.message !== undefined ? err.message : err;
          if (actual !== msg) throw new Error("Expected the error message " + fmt(msg) + ", but got " + fmt(actual));
        }
        return;
      }
      if (threw) throw err;
      let expected;
      try { expected = value(rhs); } catch (e) { throw new Error('The expected result "' + rhs + '" is not valid JavaScript: ' + e.message); }
      expect(got).toEqual(expected);
    });
  });
}
