# Users page (v2): feature inventory

Every capability of `/v2/admin/users` (`src/v2/pages/AdminUsers.tsx` and
`src/v2/components/users/*`). A redesign of the page must keep each item.

## Page shell
- [x] Hero in the primary colors: Manage kicker, title, description; members, active, disabled (only when there are any) and admin counts across every account; the five newest members as shaped faces on the backdrop shape, with the newest one's email (wide windows).
- [x] Create user (filled) and Invite users (opens `/admin/invites`).
- [x] Admin only (route guard).

## Accounts bar
- [x] Status switcher: All, Active, Disabled, with counts that follow the search and role filter; a dot on Disabled while accounts are disabled.
- [x] Search by email (debounced), role filter (everyone, admins, members), sort (newest, oldest, recently signed in, email A–Z / Z–A); active search and role show as removable chips with Clear filters.
- [x] Everything in the URL: `q`, `status`, `role`, `sort`, `page`, `size`, and `user` for the open account (opening it adds a history entry, so Back closes it).
- [x] Overflow: Select all, Invite users, Refresh; a spinner while a page reloads.
- [x] Selection turns the bar into a selection bar: count, select all / deselect all, Enable, Set storage (tiers), Disable (confirmed). Your own account and accounts already in the target state are skipped; the result reports how many changed and the first failure. Escape clears; selection clears when the list changes.

## Rows
- [x] Avatar: the email's initial in a shape and color derived from the account id; grey while disabled. On hover (or while selecting) it turns into the checkbox; touch devices start a selection from the row menu.
- [x] Email with You, Admin, Disabled and two-step verification marks; joined time and who added the account (or signed up).
- [x] Storage used of the limit with a meter that turns warning at 80% and error at 95%.
- [x] Project and library counts; last sign-in (relative, exact time on hover) or Never signed in. Columns drop out as the pane narrows; on phones storage moves under the name.
- [x] Click opens the account; while selecting, or with ctrl/cmd/shift, click toggles; shift extends a range; Space toggles.
- [x] Row menu: Open, Select, Copy email, Copy user ID, Make admin / Remove admin (confirmed), Reset password, Enable / Disable (confirmed), storage tier (Free 5 GB, Professional 100 GB, Premium 500 GB). Role, password and status are unavailable on your own account.
- [x] Empty states: no accounts (Create user) and no matches (Clear filters); loading; load errors with Retry.
- [x] Footer: range, page size (25, 50, 100), page navigation.

## Account sheet
- [x] Identity: large avatar, email, id with copy, role and status pills, You.
- [x] Actions: Enable / Disable, Make admin / Remove admin, Reset password; on your own account a note pointing to the Account page instead.
- [x] Storage: used, limit and percentage; a bar split into projects, libraries, exports and trash with a legend; storage limit as tier chips, or a custom limit in GB.
- [x] Activity: projects, libraries, providers, exports.
- [x] Account facts: joined, last sign-in, created by, invite code (copy) and note, two-step verification.

## Dialogs
- [x] Create user: email, optional password (generate, show, copy; at least 8 characters), role (User / Admin), access (Active / Disabled, disabled by default), storage tier. The snackbar offers to open the new account.
- [x] Reset password: new password with generate, show and copy; the user is signed out everywhere.
- [x] Confirmations for role changes, enabling, disabling, and bulk enable / disable.
