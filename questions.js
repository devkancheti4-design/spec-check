// ============================================================================
//  QUESTIONS
//  Add a new question by copying one of the objects below. Fields:
//    id        unique slug (used to save your code + best score)
//    title     shown in the sidebar
//    topic     small label above the title
//    task      HTML shown under "Your task"
//    html      the page markup the code runs against ("" = no page)
//    css       optional styles for the preview page
//    mock      data the fake fetch() returns in the preview (no real network)
//    starter   the code you start from
//    solution  a reference answer (it must pass every spec)
//    tests     function ({ it, expect, expectAsync, mockFetch, respond, flush, sleep }) { ...specs }
// ============================================================================

const QUESTIONS = [
  // --------------------------------------------------------------------------
  {
    id: "api-feed",
    topic: "3.2 Fetching Data: the Fetch API & JSON",
    title: "API Feed Renderer",
    task: `
      <p>Fetch a list of posts from an API, parse the JSON and render each one into <code>#feed</code>.</p>
      <ol>
        <li>Reset the container: <code>feed.innerHTML = ""</code>.</li>
        <li>Call <code>fetch(API)</code> and <b>await</b> the Response.</li>
        <li>Check <code>response.ok</code>. A 404 or 500 still resolves, so throw your own error.</li>
        <li><b>Await</b> <code>response.json()</code> to get the array of items.</li>
        <li>For each item, create an <code>&lt;li class="item"&gt;</code>, set its <code>textContent</code> to the item's title and append it.</li>
        <li>Wrap it in <code>try/catch</code>. On failure, append a <code>&lt;p class="error"&gt;</code> with a friendly message.</li>
      </ol>`,
    html: `<header class="hero"><h1>API Feed</h1><p>Items fetched from the API render below.</p></header>
<main><ul id="feed"></ul></main>`,
    css: `
      body{margin:0;font-family:system-ui,sans-serif;background:#f6f8fb;color:#1c2b3a}
      .hero{padding:22px 20px 14px;background:#fff;border-bottom:1px solid #e3e8ef}
      .hero h1{margin:0 0 4px;font-size:26px;color:#173a5e}
      .hero p{margin:0;color:#56677a;font-size:14px}
      main{padding:12px 20px}
      #feed{list-style:none;margin:0;padding:0;display:grid;gap:8px}
      .item{background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:10px 12px;font-size:14px}
      .error{color:#b42318;background:#fef3f2;border:1px solid #fecdca;border-radius:8px;padding:10px 12px;margin:0}`,
    mock: [
      { userId: 1, id: 1, title: "sunt aut facere repellat provident occaecati", body: "…" },
      { userId: 1, id: 2, title: "qui est esse", body: "…" },
      { userId: 1, id: 3, title: "ea molestias quasi exercitationem repellat", body: "…" },
      { userId: 1, id: 4, title: "eum et est occaecati", body: "…" },
      { userId: 1, id: 5, title: "nesciunt quas odio", body: "…" },
    ],
    starter: `// API Feed Renderer — YOUR TASK
// Fetch a list of items from an API, parse the JSON, and render each one into #feed.
// The #feed container already exists in index.html (the markup loads before this script).

const feed = document.querySelector("#feed");
const API = "https://jsonplaceholder.typicode.com/posts";

// TODO: Create an async function named loadFeed() that does the following:
//
//   1. Reset the container: set feed.innerHTML = "" so each load starts clean.
//   2. Call fetch(API) and AWAIT the Response.
//   3. Check response.ok — a 404/500 still resolves the promise, so throw an
//      error yourself for HTTP errors, e.g. throw new Error("HTTP " + res.status).
//   4. AWAIT response.json() to parse the body into an array of items.
//   5. Loop the items and, for each one, create a <li> with class "item",
//      set its textContent to the item's title, and append it to #feed.
//   6. Wrap steps 2-5 in try/catch. On failure, append a <p> with class "error"
//      and a friendly message to #feed instead of leaving a blank page.
//
// Finally, call loadFeed() once so the feed loads when the page opens.

`,
    solution: `const feed = document.querySelector("#feed");
const API = "https://jsonplaceholder.typicode.com/posts";

async function loadFeed() {
  feed.innerHTML = "";
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const items = await res.json();
    for (const item of items) {
      const li = document.createElement("li");
      li.className = "item";
      li.textContent = item.title;
      feed.appendChild(li);
    }
  } catch (err) {
    const p = document.createElement("p");
    p.className = "error";
    p.textContent = "Sorry, the feed could not be loaded. Please try again.";
    feed.appendChild(p);
  }
}

loadFeed();
`,
    tests: function ({ it, expect, expectAsync, mockFetch, respond }) {
      const API = "https://jsonplaceholder.typicode.com/posts";
      const $feed = () => document.querySelector("#feed");
      const items = () => [...$feed().querySelectorAll("li.item")];
      const posts = [
        { id: 1, title: "First post" },
        { id: 2, title: "Second post" },
        { id: 3, title: "Third post" },
      ];

      it("1. defines a global loadFeed function", () => {
        expect(typeof loadFeed, "typeof loadFeed").toBe("function");
      });

      it("2. loadFeed is async — calling it returns a Promise", async () => {
        mockFetch(() => respond(posts));
        const result = loadFeed();
        expect(result, "loadFeed()").toBeInstanceOf(Promise);
        await result;
      });

      it("3. calls fetch(API) exactly once per load", async () => {
        const f = mockFetch(() => respond(posts));
        await loadFeed();
        expect(f.calls.length, "number of fetch calls").toBe(1);
        expect(String(f.calls[0][0]), "url passed to fetch").toBe(API);
      });

      it('4. renders one <li class="item"> per item', async () => {
        mockFetch(() => respond(posts));
        await loadFeed();
        expect(items().length, 'number of <li class="item">').toBe(3);
      });

      it("5. each <li> shows the item's title", async () => {
        mockFetch(() => respond(posts));
        await loadFeed();
        expect(items().map((li) => li.textContent.trim()), "li texts").toEqual(posts.map((p) => p.title));
      });

      it("6. resets #feed first — loading twice does not duplicate items", async () => {
        $feed().innerHTML = '<li class="item">stale item</li>';
        mockFetch(() => respond(posts));
        await loadFeed();
        await loadFeed();
        expect(items().length, "items after two loads").toBe(3);
        expect($feed().textContent.includes("stale item"), "old content still present").toBe(false);
      });

      it("7. awaits response.json() before rendering", async () => {
        mockFetch(() => respond(posts, { jsonDelay: 30 }));
        await loadFeed();
        expect(items().length, "items after a slow json()").toBe(3);
      });

      it("8. uses textContent — HTML inside a title is shown as text", async () => {
        mockFetch(() => respond([{ id: 9, title: "<b>bold?</b>" }]));
        await loadFeed();
        expect($feed().querySelector("b"), "a <b> element created from the title").toBeNull();
        expect(items()[0] && items()[0].textContent, "li text").toBe("<b>bold?</b>");
      });

      it('9. network failure → shows <p class="error"> and does not crash', async () => {
        mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
        await expectAsync(loadFeed(), "loadFeed() when fetch rejects").toBeResolved();
        const p = $feed().querySelector("p.error");
        expect(p, 'a <p class="error"> inside #feed').not.toBeNull();
        expect(p.textContent.trim().length > 0, "error message has text").toBe(true);
      });

      it("10. HTTP error (response.ok === false) is treated as a failure", async () => {
        mockFetch(() => respond([{ id: 1, title: "should not render" }], { ok: false, status: 500 }));
        await loadFeed();
        expect($feed().querySelector("p.error"), 'a <p class="error"> for a 500').not.toBeNull();
        expect(items().length, "items rendered for a 500").toBe(0);
      });
    },
  },

  // --------------------------------------------------------------------------
  {
    id: "promises-async",
    topic: "Asynchronous JavaScript: Promises & async/await",
    title: "Promise Toolkit (TODO 1–10)",
    task: `
      <p>Write each function under its TODO in <code>app.js</code>. Names must match exactly, because the tests call them by name.</p>
      <ul>
        <li><code>resolveWith</code>, <code>rejectWith</code>, <code>delay</code>, <code>doubleAsync</code>: Promise basics</li>
        <li><code>fetchJSON</code>: await fetch, throw if <code>!ok</code>, return the parsed JSON</li>
        <li><code>getSongTitles</code>, <code>getSongById</code>: build on fetchJSON</li>
        <li><code>fetchAll</code>: run requests in parallel with <code>Promise.all</code></li>
        <li><code>safeFetch</code>: try/catch, returning <code>null</code> on any failure</li>
      </ul>
      <p class="muted">This question has no page. Use <code>console.log</code> and the results panel.</p>`,
    html: "",
    mock: [
      { id: 1, title: "Morning Drive" },
      { id: 2, title: "Neon Rain" },
      { id: 3, title: "Paper Boats" },
    ],
    starter: `/*
  Asynchronous JavaScript — Promises & async/await
  -------------------------------------------------
  Write each function below its TODO comment.
  The function NAMES must match exactly — the tests call them by name.

  fetch() is faked while the tests run, so no real network is used.
  A "song" looks like: { id: 1, title: "Morning Drive" }
*/

// TODO 1: resolveWith(value)
//   Return a Promise that RESOLVES to \`value\`. (Hint: Promise.resolve)

// TODO 2: rejectWith(message)
//   Return a Promise that REJECTS with \`new Error(message)\`.

// TODO 3: delay(ms)
//   Return a Promise that resolves after \`ms\` milliseconds.
//   (Hint: new Promise(resolve => setTimeout(resolve, ms)))

// TODO 4: doubleAsync(n)
//   Make it an \`async\` function that returns n * 2.
//   (An async function automatically returns a Promise.)

// TODO 5 + 6: fetchJSON(url)
//   \`await fetch(url)\`. If the response's \`.ok\` is false, THROW an Error.
//   Otherwise return the parsed JSON (\`await response.json()\`).

// TODO 7: getSongTitles(url)
//   Fetch the list of songs, then return an array of every song's .title.

// TODO 8: getSongById(url, id)
//   Fetch the songs, return the one whose .id === id, or null if none.

// TODO 9: fetchAll(urls)
//   Fetch every url in the array at the same time with Promise.all,
//   and resolve to an array of all the parsed results.

// TODO 10: safeFetch(url)
//   Try to fetch + parse the url. On success return the data; if
//   anything goes wrong (rejection / non-ok), return null. (try/catch)

`,
    solution: `// TODO 1
function resolveWith(value) {
  return Promise.resolve(value);
}

// TODO 2
function rejectWith(message) {
  return Promise.reject(new Error(message));
}

// TODO 3
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// TODO 4
async function doubleAsync(n) {
  return n * 2;
}

// TODO 5 + 6
async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }
  return response.json();
}

// TODO 7
async function getSongTitles(url) {
  const songs = await fetchJSON(url);
  return songs.map((song) => song.title);
}

// TODO 8
async function getSongById(url, id) {
  const songs = await fetchJSON(url);
  return songs.find((song) => song.id === id) ?? null;
}

// TODO 9
function fetchAll(urls) {
  return Promise.all(urls.map((url) => fetchJSON(url)));
}

// TODO 10
async function safeFetch(url) {
  try {
    return await fetchJSON(url);
  } catch (err) {
    return null;
  }
}
`,
    tests: function ({ it, expect, expectAsync, mockFetch, respond, flush }) {
      const songs = [
        { id: 1, title: "Morning Drive" },
        { id: 2, title: "Neon Rain" },
        { id: 3, title: "Paper Boats" },
      ];

      it("TODO 1: resolveWith(value) resolves to value", async () => {
        await expectAsync(resolveWith(42), "resolveWith(42)").toBeResolvedTo(42);
        await expectAsync(resolveWith("hi"), 'resolveWith("hi")').toBeResolvedTo("hi");
      });

      it("TODO 2: rejectWith(message) rejects with new Error(message)", async () => {
        await expectAsync(rejectWith("boom"), 'rejectWith("boom")').toBeRejectedWithError("boom");
      });

      it("TODO 3: delay(ms) resolves after ms milliseconds", async () => {
        const t0 = performance.now();
        const p = delay(120);
        expect(p, "delay(120)").toBeInstanceOf(Promise);
        await p;
        expect(Math.round(performance.now() - t0), "ms waited for delay(120)").toBeGreaterThanOrEqual(110);
      });

      it("TODO 4: doubleAsync(n) returns a Promise of n * 2", async () => {
        const p = doubleAsync(5);
        expect(p, "doubleAsync(5)").toBeInstanceOf(Promise);
        await expectAsync(p, "doubleAsync(5)").toBeResolvedTo(10);
        await expectAsync(doubleAsync(-3), "doubleAsync(-3)").toBeResolvedTo(-6);
      });

      it("TODO 5: fetchJSON(url) calls fetch(url) and returns the parsed JSON", async () => {
        const f = mockFetch(() => respond(songs));
        await expectAsync(fetchJSON("/api/songs"), 'fetchJSON("/api/songs")').toBeResolvedTo(songs);
        expect(f.calls.length, "number of fetch calls").toBe(1);
        expect(String(f.calls[0][0]), "url passed to fetch").toBe("/api/songs");
      });

      it("TODO 6: fetchJSON throws an Error when response.ok is false", async () => {
        mockFetch(() => respond({ message: "Not found" }, { ok: false, status: 404 }));
        await expectAsync(fetchJSON("/missing"), "fetchJSON on a 404").toBeRejectedWithError();
      });

      it("TODO 7: getSongTitles(url) returns every song's title", async () => {
        mockFetch(() => respond(songs));
        await expectAsync(getSongTitles("/api/songs"), "getSongTitles()").toBeResolvedTo([
          "Morning Drive",
          "Neon Rain",
          "Paper Boats",
        ]);
      });

      it("TODO 8: getSongById(url, id) finds the song, or null", async () => {
        mockFetch(() => respond(songs));
        await expectAsync(getSongById("/api/songs", 2), "getSongById(url, 2)").toBeResolvedTo(songs[1]);
        await expectAsync(getSongById("/api/songs", 99), "getSongById(url, 99)").toBeResolvedTo(null);
      });

      it("TODO 9: fetchAll(urls) fetches every url at the same time (Promise.all)", async () => {
        const gates = [];
        const f = mockFetch((url) => new Promise((res) => gates.push(() => res(respond({ url })))));
        const p = fetchAll(["/a", "/b", "/c"]);
        await flush();
        expect(f.calls.length, "fetches started before the first one finished").toBe(3);
        gates.forEach((open) => open());
        await expectAsync(p, "fetchAll([...])").toBeResolvedTo([{ url: "/a" }, { url: "/b" }, { url: "/c" }]);
      });

      it("TODO 10: safeFetch(url) returns data, or null on any failure", async () => {
        mockFetch(() => respond(songs));
        await expectAsync(safeFetch("/ok"), "safeFetch on success").toBeResolvedTo(songs);
        mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
        await expectAsync(safeFetch("/down"), "safeFetch when fetch rejects").toBeResolvedTo(null);
        mockFetch(() => respond({}, { ok: false, status: 500 }));
        await expectAsync(safeFetch("/500"), "safeFetch on a 500").toBeResolvedTo(null);
      });
    },
  },
];
