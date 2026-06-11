# Family Schedule Prototype Design

## Goal

Build a mobile-first family schedule board that works without login, invites, or location sharing.

## Scope

- Show upcoming family events.
- Let anyone add, edit, and delete events.
- Let each family member mark availability as available, unavailable, or unsure.
- Store prototype data in the browser so the flow can be tested immediately.

## Non-Goals

- User accounts.
- Family invitation links.
- Real-time location sharing.
- Push notifications.
- Production database integration.

## Approach

The prototype is a static mobile web app in `prototype/`. It uses plain HTML, CSS, and JavaScript so it can be opened directly in a browser without installing dependencies. Core schedule and response behavior lives in small pure functions with Node-based tests.

The production version can keep the same screens and data concepts, then replace browser storage with Supabase tables.

## Data Model

- Member: `id`, `name`, `color`
- Event: `id`, `title`, `date`, `time`, `note`
- Response: `eventId`, `memberId`, `status`

Response status values:

- `available`
- `unavailable`
- `unsure`

## Screens

- Home: upcoming events, response summary, add button.
- Event form: create or edit title, date, time, and note.
- Event detail panel: member response buttons and delete action.

## Risks

Anyone with the URL can view and edit data. This is acceptable for the prototype, but production should add at least a family code or simple password if private details are stored.
