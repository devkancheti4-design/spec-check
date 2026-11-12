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

## Add a question

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
