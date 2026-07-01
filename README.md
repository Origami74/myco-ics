# myco-ics — Incident Command over the mesh

A **Myco nsite** that forms a **cryptographically-verifiable chain of command**
with no internet and no infrastructure, over a Myco BLE mesh. Static Nostr client
(applesauce + React + TypeScript + Vite) talking **only** to the device's
embedded relay at `ws://localhost:4869`.

The design and rationale live in [docs/design.md](docs/design.md). This is the
POC implementation of §5 (event kinds), §6 (attestation-chain verification), and
§8 (flows).

## What it does

- **Declare an incident** (red action) — you become its Incident Commander; your
  in-app **participant key** is the root of trust.
- **Join & request a role** under someone already in the chain; **leaders accept
  or deny** — the only admission control.
- **Chain of command** is derived entirely from signed events, offline: tap any
  node to see its full signature-verified path back to the IC.
- **Orders down / activity up**: ICS-202 objectives and ICS-204 assignments flow
  down; ICS-214 log entries flow up. Every form is attributable to a verified role.
- **Work an assignment**: the assignee acknowledges, reports progress, and marks
  it complete/blocked (a `9476` reply thread with a `status` tag) — the report
  flows back up the same attested chain that issued the order.

## Layout

- [`src/ics.ts`](src/ics.ts) — the domain layer: participant identity, event
  kinds (§5), publishing (§8), and the `verify()` attestation-chain walk (§6).
- [`src/App.tsx`](src/App.tsx) — native-app shell: bottom tabs (Incidents ·
  Overview · Chain · Orders · Log).
- [`src/debug.ts`](src/debug.ts) — in-WebView console mirror (⚙ in the header).

## Identity — three separate keys (design §3)

The **participant key** is this *person's* identity in the incident. myco-ics
generates it on first launch into its own origin storage; it is completely
independent of the Myco device key and the nsite author key. No Myco secret is
ever exposed to the WebView.

## Run

```
npm install
npm run dev      # browser dev; append ?relay=wss://… to use a throwaway relay
npm run build    # static nsite → dist/
```

By default the app talks only to `ws://localhost:4869` (the embedded
`myco-relay`, fed by the FIPS mesh). For plain browser testing without a device,
override the relay with `?relay=`.

## Deploy as an nsite

The static build in `dist/` is the deployable nsite. `vite base: "./"` emits
relative asset URLs so it loads under any nsite host path, and `public/` ships a
favicon, an `apple-touch-icon`, `icon-192/512`, and a `manifest.webmanifest` for
home-screen install.

Deployment metadata lives in [`.nsite/config.json`](.nsite/config.json) (relays,
Blossom servers, site `id`/`title`/`description`) — the format read by
[`nsite-cli`](https://github.com/hzrd149/nsite-cli), which uploads the blobs and
publishes the author-signed manifest (kind `34128`/`35128`).

```sh
npm run deploy          # = npm run build && npx nsite-cli upload dist
```

First run prompts for the **author signer** — use a NIP-46 bunker so no nsec
touches disk — and writes the resulting `bunkerPubkey` back into
`.nsite/config.json`. This author key is separate from the Myco device key and
from each participant's in-app key (design §3). Once published, the app installs
in Myco from the Library like any other nsite.

## Status

POC. The **live mesh flood already works**: the propagator's gossip is
default-allow for non-manifest kinds, and the embedded relay stores regular
(`9470–9476`) and addressable (`39470`) events generically, so the whole chain
crosses Circle peers today (TTL=3, split-horizon, dedup). The remaining mesh gap
is *backlog reconcile* — `myco-core`'s `pull_recent_chat` still pulls only
`kind:9`, so a device joining an incident **mid-flight** won't fetch pre-existing
events (only live ones going forward). Still needs the sandbox/capability gating
in [docs/design.md §11](docs/design.md) (signing, relay access, consent-gated
app-kind forwarding). Voice/photo blobs and IC succession are out of scope (§12).
