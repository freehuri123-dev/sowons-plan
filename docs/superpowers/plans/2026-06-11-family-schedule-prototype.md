# Family Schedule Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local mobile-first prototype for family schedule sharing and availability checks.

**Architecture:** Create a static app under `prototype/`. Keep data transformations in `prototype/schedule-core.js`, UI behavior in `prototype/app.js`, and styling in `prototype/styles.css`. Use browser localStorage for prototype persistence.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node `node:test`.

---

### Task 1: Core Schedule Logic

**Files:**
- Create: `prototype/schedule-core.js`
- Create: `prototype/tests/schedule-core.test.js`

- [x] Step 1: Write tests for sorting, response updates, and summary counts.
- [x] Step 2: Run tests and verify they fail because implementation is missing.
- [x] Step 3: Implement pure functions.
- [x] Step 4: Run tests and verify they pass.

### Task 2: Static Mobile UI

**Files:**
- Create: `prototype/index.html`
- Create: `prototype/styles.css`
- Create: `prototype/app.js`

- [x] Step 1: Build the mobile-first HTML shell.
- [x] Step 2: Add responsive styling for event cards, forms, and member response controls.
- [x] Step 3: Wire UI to core functions and localStorage.
- [x] Step 4: Verify the app loads and can create/update/delete events.

### Task 3: Prototype Handoff

**Files:**
- Create: `prototype/README.md`

- [x] Step 1: Document how to open the prototype.
- [x] Step 2: Note what should change for the Supabase-backed production version.
