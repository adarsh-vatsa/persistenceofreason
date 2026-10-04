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

- `## Heading` → a numbered section, shown as a cue in the left column (Cornell style)
- `^[a note]` → a handwritten margin note in the cue column
- `> [!claim]`, `> [!conjecture]`, `> [!definition]`, `> [!proof]` … → numbered, theorem-style blocks
- `$x$`, `$$…$$` → math (set `math: true` in the frontmatter)
- `summary:` → the Cornell summary at the foot of the piece
- `status: conjecture | sketch | settled` and `tags: a, b` → shown under the title

Your name, abstract, links and papers live in `site.config.mjs`. The about and research
text live in `content/`.

## The vault

1. Put files in `vault/`. Subfolders show up as folders in the vault's sidebar. Text inside PDFs, notes and documents is indexed (encrypted) so the vault's search finds
   words inside files and jumps to the right page. Almost anything renders in the browser:
   PDF, images, video, audio, Markdown (with math), Jupyter notebooks, CSV/Excel, Word (.docx),
   HTML (sandboxed), and code/text (.py, .tex, .bib, .json, …). Anything else gets a download button.
2. `npm run seal`. It uses the passphrase saved in `.vault-pass` (gitignored, never uploaded)
   and re-encrypts the whole vault into `sealed/`.
3. Commit and push. Only the encrypted copies are uploaded.

**To open it**, double-click your name in the top corner of any page, type `vault` into the
⌘K search, or go to
`persistenceofreason.com/#vault` (worth bookmarking). Leave "remember this device" ticked and
that browser opens the vault without the passphrase from then on. "Lock and forget this
device" undoes that.

How it's protected: files are encrypted with AES-256-GCM, using a key derived from your passphrase
(PBKDF2-SHA256, 600k iterations). The server and anyone scraping it only ever see random-named
ciphertext. Decryption happens in your browser. The easter egg is only the door; the encryption is
the lock. So:

- A longer passphrase (a few random words) is much harder to crack offline than a word plus digits.
- To change the passphrase, edit `.vault-pass` and run `npm run seal` again. Remembered devices will ask once more.
- `vault/` is in `.gitignore`. Keep it that way if the repo is ever public.

## Deploying

`npm run build`, then upload `dist/` to any static host (GitHub Pages, Netlify, Cloudflare Pages).
Set your real domain in `SITE.url` at the top of `build.mjs` so the RSS feed links are correct.
