# Project Viewer List Design Spec

This document defines the intended UI design rules for the four list-based tabs inside the project viewer:

- `Drafts`
- `Queue`
- `Done`
- `Album`

The goal is consistency of structure, spacing, hierarchy, and interaction across desktop and mobile.

## 1. Shared Principles

- `Drafts`, `Queue`, and `Done` represent the same underlying job data model and should therefore use the same list-item shell.
- `Album` may differ in content, but its toolbar should follow the same visual language as the other tabs.
- Toolbar and list layouts must feel like one system, not four independently styled screens.
- Mobile should be an adaptation of the desktop layout, not a separate visual design language.

## 2. Toolbar Rules

### 2.1 Shared Toolbar Language

All four tabs should use the same toolbar design language:

- same container treatment
- same border and background treatment
- same spacing rhythm
- same button sizing model
- same icon sizing model
- same hidden-label behavior on mobile

Toolbar actions may differ by tab, but the visual system should stay consistent.

### 2.2 Button Rules

- Buttons inside the toolbar should use one compact size system.
- Destructive actions use the red treatment.
- Primary actions may use blue, but should not become oversized CTA blocks that break the toolbar rhythm.
- On mobile, button text should be hidden; icon-only buttons are acceptable.
- On desktop, labels can remain visible.

### 2.3 Select All Placement

- The `Select All` control should visually align with the checkbox column in the list below.
- The checkbox icon inside the toolbar must share the same horizontal starting line as the row checkboxes.
- Hover treatment for checkboxes should not add a background fill.

### 2.4 Toolbar Alignment

- On desktop, right-side toolbar actions must be explicitly right-aligned.
- Toolbar-to-list vertical spacing must be the same in all four tabs.

## 3. Job List Rules: Drafts, Queue, Done

### 3.1 Shared Job Row Shell

`Drafts`, `Queue`, and `Done` should use the same shared row component for:

- checkbox
- expand/collapse affordance
- prompt title
- provider/model chip
- metadata chips
- status chip
- action buttons
- expanded panel shell

Tab-specific differences should be passed as content, not implemented through separate row layouts.

### 3.2 Row Hierarchy

Each row should follow this hierarchy:

1. First line: checkbox, expand control, prompt
2. Secondary metadata area: provider/model, metadata chips, status, actions
3. Expanded content area: tab-specific details

The prompt should have its own line and should not compete horizontally with provider/model or metadata chips.

### 3.3 Chips

Provider/model, metadata, and status should share one chip sizing system:

- same font size
- same padding
- same border weight
- same corner radius
- same vertical centering

Provider and model should appear as one combined chip, not split into two chips.

Status chips should use the same physical size system as metadata chips, even if text color differs by state.

### 3.4 Action Buttons

- Row-level action buttons should remain compact.
- Buttons should align consistently with the chip row.
- On mobile, buttons must not drift vertically relative to chips.

## 4. Mobile Rules for Drafts, Queue, Done

### 4.1 Mobile Layout Model

Mobile should preserve the same information hierarchy as desktop, with stacked rows where needed.

Preferred mobile structure:

1. Prompt row
2. Provider/model row
3. Metadata + status + actions row

### 4.2 Provider/Model on Mobile

- Provider/model must remain visible on mobile.
- It should be allowed to truncate.
- It should not force horizontal scrolling of the whole row.

### 4.3 Metadata and Actions on Mobile

- Metadata chips and status should stay together as one group.
- Buttons should sit on the right side of that same row.
- Avoid free-form wrapping that causes visual imbalance between chips and buttons.
- Avoid horizontal scrolling for the entire metadata row unless there is no better option.

## 5. Album Rules

### 5.1 Toolbar

`Album` should match the toolbar style of the other tabs:

- same shell
- same compact controls
- same mobile icon-only behavior
- same spacing and alignment rules

### 5.2 Action Consolidation

Where appropriate, `Album` can merge actions based on selection state:

- `Export All` / `Export Selected`
- `Copy All` / `Copy To Library`

This is acceptable as long as the toolbar still reads like the same system.

### 5.3 Count Display

The total/selected count display in `Album` should use the same logic and tone as the other tabs.
Storage size may appear as supplemental info, but it should not replace the shared count behavior.

## 6. Header Relationship

- The left workflow panel and the right jobs/tabs area should feel aligned as adjacent panes.
- Header heights across the two panes should be visually consistent.
- Small pixel differences are noticeable and should be treated as bugs, not acceptable approximation.

## 7. Implementation Guidance

- Prefer shared components over copied JSX.
- If `Drafts`, `Queue`, and `Done` diverge visually, that is usually a sign the row shell is not abstracted enough.
- Chip sizing should come from one shared chip component.
- Toolbar layout should come from one shared toolbar component.
- Mobile behavior should be handled through responsive rules inside shared components, not separate duplicated layouts.

## 8. Non-Goals

This spec does not define:

- exact color tokens
- animation details
- backend behavior
- row expanded-content semantics

It only defines the shared interaction and layout system for the project viewer lists and toolbars.
