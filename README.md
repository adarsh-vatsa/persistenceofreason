# adarsh's notebook

A minimal personal site and blog. Plain HTML output, no framework.

```
posts/        your writing (Markdown)        → public
templates/    page layouts (home page lives in templates/home.html)
static/       css, js, favicon               → copied as-is
vault/        PRIVATE plaintext files        → never published, never committed
sealed/       encrypted copies of vault/     → published at /v/ (safe to commit)
dist/         the built site                 → what you deploy
```

## Writing

```bash
npm run dev        # http://localhost:4000, rebuilds on save
```

Copy `posts/_template.md` to `posts/some-idea.md`, fill in the frontmatter, delete `draft: true`.

- `^[a note]` → margin note
- `$x$`, `$$…$$` → math (set `math: true` in the frontmatter)
- `status: half-baked` → small pill under the title

## The vault

1. Put files in `vault/` (subfolders are fine). Almost anything renders in the browser:
   PDF, images, video, audio, Markdown (with math), Jupyter notebooks, CSV/Excel, Word (.docx),
   HTML (sandboxed), and code/text (.py, .tex, .bib, .json, …). Anything else gets a download button.
2. `npm run seal` and type your passphrase. This re-encrypts the whole vault into `sealed/`.
3. `npm run build` (or let `npm run dev` pick it up) and deploy.

**To open it:** on the home page, tap the squiggle under your name 5 times quickly.

How it's protected: files are encrypted with AES-256-GCM, using a key derived from your passphrase
(PBKDF2-SHA256, 600k iterations). The server and anyone scraping it only ever see random-named
ciphertext. Decryption happens in your browser. The easter egg is only the door; the encryption is
the lock. So:

- Use a strong passphrase (4–5 random words). Nothing can reset it. If it's lost, re-seal from `vault/`.
- Seal again with the same passphrase every time you add files.
- `vault/` is in `.gitignore`. Keep it that way if the repo is ever public.

## Deploying

`npm run build`, then upload `dist/` to any static host (GitHub Pages, Netlify, Cloudflare Pages).
Set your real domain in `SITE.url` at the top of `build.mjs` so the RSS feed links are correct.
