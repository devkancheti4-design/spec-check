# SpecCheck

A practice checker in the style of the assignment editor: write code in `app.js`, press **Run tests**
(Ctrl/⌘ + Enter), and the specs score your answer out of 10. You pass at 60%.

- Your code runs in a sandboxed iframe. `fetch()` is faked with sample data, so the checker needs no network.
- Your code and best score are saved in the browser (localStorage), separately for each question.
- **Solution** shows a reference answer. Every reference answer passes all of its specs.

## Run it

```bash
python3 -m http.server 8132 --directory spec-check
```

Open http://localhost:8132.

## Add your own question (no coding of tests needed)

Press **＋ Add your own question** and fill in:

1. **Question code**: paste the starter `app.js` with its TODO comments.
2. **Checks**: one line per test, `code => expected result`. **✨ Start from the TODOs** finds the
   function names in the TODOs and writes a starting list for you to edit.

```
resolveWith(42) => 42
rejectWith("boom") => throws "boom"
doubleAsync(5) instanceof Promise => true
mock: [{"id": 1, "title": "Morning Drive"}]
getSongTitles("/songs") => ["Morning Drive"]
mock: status 404
safeFetch("/missing") => null
await loadFeed(), document.querySelectorAll("li.item").length => 1
```

- Promises are awaited automatically, and objects and arrays are compared deeply.
- `mock:` sets what `fetch()` returns for the checks below it (`fail` = network error, `status 404` = HTTP error, `none` = back to normal).
- To test a page, put its markup in **Page HTML**, for example `<ul id="feed"></ul>`.

Your questions are saved in your browser and marked **YOURS** in the list. **🔗 Copy share link** puts the whole
question inside a URL, so anyone who opens the link gets the question added to their list.

## Add a built-in question

Copy an object in `questions.js` and change its fields. `tests` must be written as `function ({ ... }) { }`,
not as method shorthand, because it is turned into a string and run inside the iframe.

Inside `tests` you get these helpers:

| helper | what it does |
| --- | --- |
| `it(name, fn)` | one spec; `fn` may be `async`; 3 s timeout |
| `expect(value, label?)` | `toBe`, `toEqual`, `toBeNull`, `toBeTruthy`, `toContain`, `toHaveLength`, `toBeGreaterThan(OrEqual)`, `toBeLessThan`, `toBeInstanceOf`, `toMatch`, `.not` |
| `expectAsync(promise, label?)` | `toBeResolved`, `toBeResolvedTo(v)`, `toBeRejected`, `toBeRejectedWithError(msg?)` |
| `mockFetch(handler)` | replaces `fetch`; `handler(url)` returns a response, a Promise, or throws; returns a spy with `.calls` |
| `respond(data, { ok, status, jsonDelay })` | builds a fake Response |
| `flush()` / `sleep(ms)` | wait one tick / wait ms |
