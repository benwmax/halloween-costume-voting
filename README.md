# Haunted Hollywood — The Costume Awards

Guests scan a QR code at the party and vote for **Best Dressed**, **Best Couples Costume** and
**Scariest Costume**. Votes land in a Google Sheet, which tallies them for the announcement.

- **Site:** https://benwmax.github.io/halloween-costume-voting/ (GitHub Pages, deployed by
  `.github/workflows/deploy.yml` on every push to `main`)
- **Ballot box:** a Google Apps Script web app inside the "Costume Votes" spreadsheet
  (`apps-script/Code.gs`)
- **Look:** the invitation's Haunted Hollywood ticket, simplified for phones

## How voting works

- A guest enters their own name, then for each category they want (all optional) the nominee's
  name and, optionally, the costume. As they type, the page suggests names other guests have already
  entered, matched by name *or* costume ("vamp" finds the vampire), so later votes settle on one
  spelling.
- **One ballot per phone.** The first visit creates a random device ID, stored in localStorage and
  copied to a cookie. Every vote is keyed on (device, category), so voting again from the same phone
  replaces the earlier vote. A vote under a voter name that has already voted in that category also
  replaces the old one. That catches someone re-voting from a private tab under the same name.
- Guests can change or clear their votes until you close voting. Clearing a category withdraws that
  vote.
- Guests never see counts. The autocomplete list is alphabetical and carries no tallies.

## Setting up the ballot box (once)

1. Create a Google Sheet called **Costume Votes**.
2. Open **Extensions → Apps Script** and paste in `apps-script/Code.gs`.
3. In the editor, choose **`setup`** from the function list and click **Run**. Approve the access
   prompt. This creates the `Votes`, `Settings`, `Merges` and `Log` tabs, a **Voting open**
   checkbox (ticked) and a random **Host key**.
4. **Deploy → New deployment → Web app.** Execute as: **Me**. Who has access: **Anyone**. Copy the
   `/exec` URL.
5. In GitHub, open **Settings → Secrets and variables → Actions → Variables** and add
   `VITE_VOTE_ENDPOINT` set to that URL.
6. Re-run the deploy (**Actions → Deploy to GitHub Pages → Run workflow**), or push any commit.
   Vite bakes the URL in at build time, so a deploy made before the variable existed will show
   guests an error rather than quietly losing votes.

**After editing `Code.gs`:** use **Deploy → Manage deployments → pencil → Version: New version →
Deploy**. That keeps the same `/exec` URL. A *New deployment* creates a different URL that the site
doesn't know about.

## On the night

| To… | Do this |
| --- | --- |
| See the standings | Spreadsheet menu **Costume Votes → Refresh tally**, then open the `Tally` tab. Ties share a place (co-winners). |
| Fix split spellings | In `Merges`, add a row: *Alias* = the stray spelling (e.g. `the vampire`), *Canonical* = the name to count it under (e.g. `Sarah Williams`). Case, spacing, punctuation and accents are already ignored, and couples match in either order (`Andi & Ben` = `ben and andi`). Refresh the tally after. |
| Close voting | Untick **Voting open** in `Settings`. Phones that reload, or try to vote, see "The ballot box is sealed." Tick it again to reopen. |
| Check for funny business | `Log` records every ballot (accepted, updated, withdrawn, rejected), with its device ID. |

## QR code

`qr/vote-qr.svg` (best for print) and `qr/vote-qr.png` point at the Pages URL. To regenerate it
for another URL:

```bash
npm run qr -- https://example.com/other-url
```

## Development

```bash
npm install
npm run dev            # ballot at localhost; with no endpoint set, uses sample nominees and records nothing
npm run test:endpoint  # exercises Code.gs against fake Apps Script services
npm run build
```

To try it against the real sheet locally, copy `.env.example` to `.env.local` and paste in the
`/exec` URL.

**Adding a category:** add it to `CATEGORIES` in **both** `apps-script/Code.gs` and
`src/lib/categories.ts`, then redeploy the script as a new version.

## Phase 2: awards presentation

`doGet?action=results&key=<Host key>` already returns ranked results per category, with ties
sharing a rank and the most common costume description for each nominee. The awards screen will be
a host-only page built on that endpoint.
