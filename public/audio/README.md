# Bundled recitation

Generated directory — do not put a file here that the script does not produce. To fetch one:

```bash
npm run fetch:audio                  # Alafasy, the default reciter
npm run fetch:audio -- ar.husary     # any other edition id from RECITERS in App.tsx
npm run fetch:audio -- --force       # re-download files that are already here
```

`scripts/fetch-audio.mjs` writes one MP3 per verse into `<reciter>/`, addressed by the **global**
ayah number (1–6236), not the number within the surah — the same numbering `getSurahDetail` hands
out and the same one the CDN uses. About 1.6 GB and a few thousand requests per reciter.

| Path | Contents |
|---|---|
| `<reciter>/1.mp3` … `6236.mp3` | One verse each, 128 kbps |
| `manifest.json` | Which reciters are complete on this machine — the only file the app reads directly |

## Everything but this is in the repo; this is not

`public/data/` and `public/fonts/` are committed. This directory is in `.gitignore`, README aside:
a gigabyte and a half of MP3s is not something a git repository should carry, and it would be
carried in every clone forever. So a fresh checkout has no recitation and plays from
`cdn.islamic.network` as before. Run the script and it plays off disk.

`manifest.json` is ignored along with the files, because it is a claim about *this machine*.
Committing it would tell a clone that has no audio to build local URLs for files that are not
there, and every verse would fail to load.

## How the app decides

`getAyahAudioUrl` in `services/quranApi.ts` looks the reciter up in `manifest.json`, which is read
once at startup with the text. Present → the local file; absent → the CDN. There is no per-file
check and no fallback in the middle of a block: the script writes a reciter into the manifest only
once **all 6236** of its files are on disk. Half a recitation would fail somewhere inside a loop,
which is worse than playing the whole of it off the network.

The script is resumable. Each file is written under a `.part` name and moved into place only after
it has been checked, so anything sitting here under its final name is whole, and a second run
skips it. Interrupt it and run it again — and if any verse fails for good, that reciter stays out
of the manifest and the app keeps using the CDN until the gaps are filled.

## A build carries it — unless you put it elsewhere

`public/` is copied into `dist/` verbatim, so once the audio is here `npm run build` produces a
`dist/` of about 1.6 GB and takes correspondingly longer. On a machine you read on, that is the
point: that `dist/` needs no connection at all.

On a server it is waste, because the recitation then sits on the disk twice — once in the
checkout, once in what is served — and every deploy copies 1.6 GB. Point the script somewhere
outside the repository instead and let the web server map `/audio/` onto it:

```bash
HIFZ_AUDIO_DIR=/var/lib/hifz-audio npm run fetch:audio
```

```nginx
location /audio/ {
    alias /var/lib/hifz-audio/;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

The layout under the directory is the same either way, so the app cannot tell the difference —
it asks for `/audio/manifest.json` and `/audio/<reciter>/<n>.mp3` and does not care who answers.
Immutable is honest here: a verse is addressed by its global number, and that never comes back
meaning a different verse.

## Sources and terms

Fetched from [`cdn.islamic.network`](https://alquran.cloud/cdn), the CDN behind the
[alquran.cloud](https://alquran.cloud/api) API this project already takes its text from, at the
128 kbps bitrate. The files are copied unmodified.

The recordings are **not** in the public domain the way the text is: a recitation is a performance,
and the rights to it sit with the reciter and their publisher. They are made available for use in
Quran applications, which is what this is — a local copy for reading and memorizing offline.
Redistributing them, or shipping this repository as a product with the audio in it, is a different
question and needs the rights holders' terms — the same caveat the Mushaf faces in `public/fonts/`
and the copyrighted translations in `public/data/` carry.
