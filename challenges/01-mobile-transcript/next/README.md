# Track 1 — WhipScribe Library UX prototype

This folder contains my Track 1 investigation prototype for the WhipScribe Library flow.

The prototype focuses on three concrete UX findings from testing:

1. **Daily transcription quota is communicated too late.**
   When the account has already used its daily free allowance, the normal upload entry point can still be started. The blocking explanation is clearer when it is shown before submission.
2. **Mobile primary navigation benefits from icon + label pairing.**
   On a narrow viewport, the persistent bottom navigation is easier to scan when each destination has a recognizable icon, a short label, and a clear active state.
3. **The desktop Library can use more available horizontal space.**
   A responsive content container makes better use of wider laptop/desktop viewports without making individual controls excessively wide.

## What is in the prototype

- `index.html` — self-contained responsive HTML/CSS/JS prototype; no build step or dependencies.
- `screenshots/whipscribe-desktop-view.png` — desktop Library reference/proposed state.
- `screenshots/whipscribe-error-handling.png` — proposed zero-minute upload state.
- `screenshots/whipscribe_mobile_bottom-navlinks.png` — proposed mobile Library navigation state.

## Run it

Open `index.html` directly in a browser, or serve the directory with any static HTTP server.

For example:

```bash
cd challenges/01-mobile-transcript/next
python -m http.server 8000
```

Then open `http://localhost:8000`.

There is no npm install and no framework dependency.

## Prototype controls

The dark bar at the top is only a prototype switcher. It is not intended as product UI.

- **Normal** — regular Library state.
- **0 min** — quota-exhausted upload state.
- **Mobile** — jumps to the responsive mobile presentation; resize the browser below 900px to see the persistent bottom navigation.

The prototype is intentionally front-end only. It does **not** upload files, call the transcription service, authenticate, charge credits, or change real account data.

## Why the quota state changed

The product already communicates the exhausted allowance in the Library/credits area and after a failed transcription. The issue I am addressing is the **timing** of that information.

The proposed state places the restriction directly inside the upload entry point:

> `0 min free transcription remaining`
>
> `Resets tomorrow`
>
> `Add credits to transcribe now →`

The upload action is then disabled in the zero-minute state. This is a smaller change than redesigning the billing or transcription pipeline, while preventing an avoidable failed submission.

Importantly, my test does **not** establish that a roughly 9-minute file is inherently invalid. The observed failure occurred while the account had already used its full `180 / 180` free-minute allowance.

## Why the mobile navigation changed

The mobile proposal keeps the existing destinations and information architecture. It only changes the navigation's visual affordance:

- familiar icon;
- short text label;
- clear active state;
- persistent bottom placement;
- safe-area-aware spacing for small screens.

No backend or routing change is required for this prototype.

## Why the desktop layout changed

The desktop proposal keeps the sidebar and Library hierarchy, but allows the main workspace to grow up to a readable maximum width. Search, source cards, filters, and the recording area can therefore use more of a wide viewport instead of leaving the central workspace unnecessarily narrow.

This is a layout/container change, not an information-architecture redesign.

## Evidence and scope

The screenshots in `screenshots/` document the states I explored and the UI directions I built. The actual product observations are described separately in the Track 1 UI-bug issues; the HTML here is the proposed front-end treatment.

The current screenshots are not presented as proof that every proposed state is already implemented in WhipScribe itself. This repository contains a prototype for discussion and review.

## Related Track 1 issues / proposals

Replace the placeholders below with the issue numbers after creating them:

- UI bug: `[desktop] Surface the daily transcription limit before an upload starts` — `#<issue-number>`
- Proposal: `Proposal: Prevent uploads when no transcription minutes remain` — `#<issue-number>`
- UI bug: `[mobile] Bottom navigation relies too heavily on text for quick recognition` — `#<issue-number>`
- Proposal: `Proposal: Add recognizable icons to mobile primary navigation` — `#<issue-number>`
- UI bug: `[desktop] Library content stays unnecessarily constrained on wide screens` — `#<issue-number>`
- Proposal: `Proposal: Let the Library use more available desktop width` — `#<issue-number>`

## Challenge 01 note

The repository's `challenges/01-mobile-transcript/README.md` asks for a next pass on the **transcript reader** itself, including reader states such as processing, search, preview boundary, text selection, and a four-speaker transcript at 320px.

This Track 1 prototype is deliberately scoped to the Library findings I reproduced and designed during product investigation. It should not be described as a complete implementation of every Challenge 01 reader state unless those reader screens are added separately.

## What I deliberately kept

- Existing Library information architecture.
- Existing source choices: Upload files, Paste links, Record audio, Import a folder, Google Drive.
- Existing credits concept and top-up path.
- Existing desktop sidebar destinations.
- Existing mobile destination set.
- Existing search, filters, sorting, and empty-state concepts.

The goal is to remove friction around the observed problems without turning a small UI fix into a broad redesign.
