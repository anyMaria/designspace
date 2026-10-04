# Designspace

A private, local-first desktop app for visual inspiration.

Drop in images, videos, PDFs, fonts, links and notes, and see everything on one infinite map.
Classify each item by type, vibe, movement and tags, explore how items connect, hover to see
what's similar, and turn filtered selections into project moodboards. AI suggestions and
"find similar" run entirely offline, on your computer.

Everything in this document is about **using** the app day to day. For the full spec and build
history, see [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) and
[docs/DECISIONS.md](docs/DECISIONS.md). For development, see [CLAUDE.md](CLAUDE.md).

## Install (Windows)

1. Download the latest `Designspace_<version>_x64-setup.exe` from **Releases**, or from the
   most recent **windows-build** run under **Actions** if there's no tagged release yet.
2. Run it. The app isn't code-signed, so Windows SmartScreen may warn you: click
   **More info → Run anyway**.
3. On first launch, pick where your library should live (the default is
   `Documents\Designspace Library`) and, optionally, folders to bring in existing images from.

## Daily use

- **Add things**: drag files or folders onto the map, paste an image (Ctrl+V), press **+ Add**,
  or Ctrl+L for a link.
- **Classify**: select an item and use the Details panel (or Triage, from the Inbox chip, for
  quick keyboard-driven sorting) to set its Type, Vibe, Movement and Tags. Accepting an AI
  suggestion (a ghost chip) is one click.
- **Search**: Ctrl+K or `/`. Type a word, or turn on "Include visual matches" to search by what
  something looks like rather than what it's tagged.
- **See connections**: hover an item to see lines to related ones; Shift+C morphs the whole map
  into clusters (Constellations).
- **Boards**: select some items (or a search) → "New board" to build a moodboard on its own
  infinite canvas, with its own frames, notes and swatches.
- **Undo** (Ctrl+Z) covers everything — nothing is ever silently lost. Deleting moves items to
  the **Trash** (Settings → Library), which purges automatically after 30 days.
- Press **?** any time for the full shortcut list.

## Where your data lives

Your library is an ordinary folder that you chose during setup — move it, back it up, or put it
under your own cloud sync if you want, though see the warning below first.

```
Designspace Library\
  designspace.db              all your metadata — the source of truth
  designspace.db-wal, -shm    SQLite working files; leave them alone while the app is running
  media\                      your original files, copied in, never modified
  backups\                    automatic and manual backups (see below)
  README.txt                  a note inside the folder itself, for future-you
```

**Cloud-synced folders (OneDrive, Dropbox, Google Drive) can damage the library database** if the
app is writing to it while a sync client is also touching the same files. Keep the library folder
on your local disk; send backups to the cloud instead (see below). The first-run setup warns you
if you pick a folder inside one of these.

A separate, smaller folder holds things that can be regenerated and aren't worth backing up —
thumbnails, PDF page renders, font specimens, logs, and the app's own machine-local settings
(window state, wheel mode, reduce motion, recent libraries). You don't need to touch it, but if
you ever want to find it, it's Tauri's `app_local_data_dir`, normally
`%LOCALAPPDATA%\com.anymaria.designspace\`. **Settings → About → "Open logs folder"** opens the
logs subfolder directly, which is the first place to look if something goes wrong.

## How backups work

- Designspace backs up your library automatically at startup, if the last backup is more than 24
  hours old — no action needed.
- It keeps the 14 most recent daily backups, plus one per week for 8 more weeks, and quietly
  deletes older ones.
- **Settings → Library → Back up now** makes one on demand; the same screen lists every backup
  and lets you **Restore** one (the current database is saved as `pre-restore-…` first, just in
  case).
- **Settings → Library → Export** also gives you a JSON file with all your metadata, or a ZIP
  with the metadata and every original file — a portable copy you can keep anywhere, including
  outside the library folder.
- **Extra destination**: set a second folder (e.g. one inside OneDrive) in Settings → Library and
  every backup is also copied there — this is the supported way to get your backups into the
  cloud without putting the live library itself at risk.
- Backups only ever cover the database (your classifications, boards, connections). Your
  original media files are never modified in place, and purging something from the Trash sends
  the file to the Windows Recycle Bin rather than deleting it outright.

## How to update

There's no auto-updater yet — updating means installing the newer version the same way you
installed the first one:

1. Download the new `Designspace_<version>_x64-setup.exe` from **Releases**.
2. Run it over your existing installation.

Your library lives in its own folder, separate from the app itself, so updating the app never
touches your data. As always, an automatic backup runs the next time you open the updated app if
your last one is more than a day old.

## Development

See [CLAUDE.md](CLAUDE.md) for the stack, commands and how to work in this repo, and
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) §7 for the full build/CI setup.

## Credits

- Typeface: [Urbanist](https://fonts.google.com/specimen/Urbanist) by Corey Hu, SIL Open Font License 1.1 (`src/design/fonts/urbanist/OFL.txt`).
