# Event Call-In & Attendance Tracker — Business Requirements Document

**Owner:** Wes Boucher
**Version:** 0.1 (draft)
**Date:** October 30, 2026
**Build target:** Built with Claude Code in VS Code

---

## 1. Purpose

A simple web app that does three jobs:

1. **Keeps a contact database** of everyone who has attended past events (name, phone, email, optionally address).
2. **Lets callers work that list** before an upcoming event: click a phone number to call, then log whether the person is coming.
3. **Lets sign-in staff record the day of the event**: who attended and who didn't show.

Every contact keeps a running history of the events they signed up for and attended.

## 2. Users and Roles

| Role | What they do |
|---|---|
| **Admin** (Wes) | Imports contacts, creates and edits events, manages users, sees everything. |
| **Caller** | Works the call list for an upcoming event, clicks to call, sets RSVP status, adds call notes. |
| **Sign-in staff** | On event day, checks people in as Attended, adds walk-ins, marks No-Shows. |

> **Open decision:** Do callers and sign-in staff need separate logins with restricted permissions, or can everyone see and do everything? **Default for v1:** every user logs in; roles exist and control which screens they see, but there is no fine-grained permission system.

## 3. Core Concepts (Data)

A plain-language picture of what the app stores:

- **Contact** — one person. Stored once, reused across all events.
- **Event** — one gathering on one date.
- **Event Registration** — the link between one contact and one event. This is where that person's status for that event lives. A contact has one registration per event they're involved with; that list of registrations *is* their history.

### 3.1 Contact fields

| Field | Required | Notes |
|---|---|---|
| First name | Yes | |
| Last name | Yes | |
| Phone | Yes* | *At least one of phone or email is required. Stored in a consistent format so it can be clicked to call. |
| Email | Yes* | |
| Street address | No | |
| City | No | |
| State | No | |
| ZIP | No | |
| Notes | No | Free text about the person. |
| Source | Auto | `Import`, `Walk-in`, or `Manual`. |
| Created / updated date | Auto | |

### 3.2 Event fields

Think of each event like a Facebook event page: everything a guest, caller, or sign-in person would want to know, in one place.

#### Basics

| Field | Required | Notes |
|---|---|---|
| Event name | Yes | |
| Short tagline | No | One line shown on cards and lists (max ~120 characters). |
| Full description | No | Rich text (bold, lists, links). What the event is and why to come. |
| Category / type | No | Admin-managed list, e.g. Networking, Workshop, Social, Fundraiser, Meeting. |
| Tags | No | Free tags for filtering and search. |
| Language | No | |
| Status | Yes | `Draft`, `Published`, `Postponed`, `Cancelled`, `Completed`. Default `Draft`. |
| Cancellation / postponement reason | No | Shown when status is Postponed or Cancelled. |

#### Date and time

| Field | Required | Notes |
|---|---|---|
| Start date and time | Yes | |
| End date and time | No | |
| Time zone | Yes | Defaults to the admin's time zone. |
| Doors open time | No | |
| Recurring | No | None / weekly / monthly / custom. Each occurrence is its own event with its own call list and attendance. |
| RSVP deadline | No | Shown to callers; after it passes, the call list shows a warning. |

#### Location

| Field | Required | Notes |
|---|---|---|
| Location type | Yes | `In person`, `Online`, or `Hybrid`. |
| Venue name | If in person | |
| Street address, city, state, ZIP | If in person | |
| Map link | Auto | Generated from the address (opens Google/Apple Maps). |
| Room / floor / suite | No | |
| Online meeting link | If online | Zoom, Teams, Meet, etc. |
| Online meeting ID / passcode | No | |
| Parking info | No | |
| Directions / how to find us | No | |
| Accessibility info | No | Wheelchair access, elevators, etc. |

#### People

| Field | Required | Notes |
|---|---|---|
| Host(s) | Yes | One or more. A host can be a user or an organization name. |
| Co-hosts | No | |
| Event contact name, phone, email | No | Who guests should call with questions. |
| Speakers / performers | No | Repeating list: name, title, short bio, headshot. |
| Sponsors | No | Repeating list: name, logo, website link. |
| Assigned callers | No | Users assigned to work this event's call list. |
| Assigned sign-in staff | No | Users working the door. |

#### Capacity, tickets, and rules

| Field | Required | Notes |
|---|---|---|
| Capacity | No | When Confirmed + Reconfirmed reaches it, the call list shows "At capacity." |
| Admission | No | `Free` or `Paid`. |
| Price | If paid | One or more price tiers (name + amount), e.g. General, VIP. |
| Ticket / registration link | No | External link if tickets are sold elsewhere. |
| Age restriction | No | All ages, 18+, 21+. |
| Dress code | No | |
| What to bring | No | |
| Food and drinks | No | e.g. "Dinner provided," "Cash bar." |
| Plus-ones allowed | No | Yes/No, and max guests per person. |
| Visibility | Yes | `Internal only` (default) or `Shareable` (only matters if public pages are added later). |

#### Agenda

| Field | Required | Notes |
|---|---|---|
| Schedule items | No | Repeating list: time, title, description, speaker. |

#### Images and files

| Field | Required | Notes |
|---|---|---|
| Cover image | No | The big banner image, like a Facebook event cover. Recommended 1920×1005 (roughly 1.91:1). Shown on the event page and as a thumbnail on lists. |
| Flyer | No | Image or PDF. |
| Venue photos | No | Multiple images. |
| Speaker headshots | No | Attached to each speaker. |
| Sponsor logos | No | Attached to each sponsor. |
| Post-event photo gallery | No | Multiple images uploaded after the event. |
| Other attachments | No | PDFs, slides, handouts. |

#### Links

| Field | Required | Notes |
|---|---|---|
| Event website | No | |
| Facebook event link | No | |
| Other social links | No | Instagram, LinkedIn, etc. |

#### Call script and sign-in notes (internal)

| Field | Required | Notes |
|---|---|---|
| Caller script / talking points | No | Shown in the caller workspace while calling. |
| Sign-in instructions | No | Shown on the event-day screen (e.g. "Hand everyone a name tag"). |
| Internal notes | No | Only visible to logged-in users. |

#### Calculated (shown, not entered)

- Counts by RSVP status: No Data, Confirmed, Tentative, Reconfirmed, Declined
- Expected headcount (Confirmed + Reconfirmed + Tentative, plus allowed plus-ones)
- Attended, No-Show, walk-ins
- Show rate (attended ÷ confirmed)
- Days until event / days until RSVP deadline

> **Event page:** every event gets a detail page that looks like a Facebook event: cover image at the top, name, date/time, location with map link, hosts, description, agenda, speakers, sponsors, and the RSVP counts. Callers and sign-in staff can open it from their screens.

### 3.3 Registration (contact ↔ event) fields

| Field | Notes |
|---|---|
| Contact | Link to the contact |
| Event | Link to the event |
| RSVP status | See section 4.1 |
| Attendance status | See section 4.2 |
| Last called date/time | Set automatically when a caller logs a call |
| Called by | The user who last updated the RSVP status |
| Call notes | Running log: each entry has text, author, timestamp |

## 4. Statuses

### 4.1 RSVP status (before the event — set by callers)

| Status | Meaning |
|---|---|
| **No Data** | Default. Not contacted yet for this event. |
| **Confirmed** | Said they're coming. |
| **Tentative** | Maybe. |
| **Reconfirmed** | Confirmed, then confirmed again in a follow-up call. |
| **Declined** | Said no. **This is a visible flag, not a lock.** Declined people stay on the call list and can still be called and moved to another status. They should be visually distinct (e.g., a red tag) so callers know before dialing. |

Any RSVP status can change to any other status. Every change is recorded with who changed it and when.

### 4.2 Attendance status (event day — set by sign-in staff)

| Status | Meaning |
|---|---|
| **Pending** | Default before/during the event. |
| **Attended** | Checked in. |
| **No-Show** | Did not attend. |

- Attendance is independent of RSVP. Someone who Declined can still show up and be marked Attended.
- When an event is closed out (see 5.5), everyone still `Pending` who had an RSVP of Confirmed, Tentative, or Reconfirmed is flagged `No-Show`. Staff can review the list before confirming.

## 5. Features

### 5.1 Contact import

- Admin uploads a **CSV or Excel (.xlsx)** file.
- A mapping step lets the admin match the file's columns to app fields (first name, last name, phone, email, address fields).
- **Preview** before saving: shows how many rows will be added, how many look like duplicates, how many have errors (e.g., no phone and no email).
- **Duplicate detection:** a row is a likely duplicate if its phone number or email matches an existing contact. Admin chooses per import: skip duplicates, or update existing contacts with the new data.
- Phone numbers are cleaned to a standard format on import (e.g., `(813) 555-1234` and `813.555.1234` become the same number).
- After import, show a summary: added, updated, skipped, errors (downloadable error list).

### 5.2 Contact database

- Searchable, sortable, filterable table of all contacts.
- Search by name, phone, or email.
- Click a contact to open their **record**, showing:
  - Contact details (editable)
  - **Event history:** every event they've been registered for, with RSVP status and attendance status for each
  - Quick stats: number of events attended, number of no-shows
  - Notes
- Admin can add or edit a contact manually.

### 5.3 Event management

- Admin creates, edits, and archives events, filling in the fields in section 3.2. The form is split into the same groups (Basics, Date and time, Location, People, etc.) so it isn't one giant page.
- Admin can **duplicate** an existing event to reuse its details for the next one.
- Image uploads show a preview and let the admin crop the cover image to the recommended shape.
- **Building the call list:** when an event is created, the admin chooses who goes on its call list:
  - Default: all contacts
  - Option: filter (e.g., attended at least one past event, attended a specific past event, exclude past no-shows)
  - Contacts can also be added to an event's list individually later.
- Each contact added to the list gets a registration with RSVP = `No Data`, Attendance = `Pending`.

### 5.4 Caller workspace (the core screen)

For a selected upcoming event:

- A list of everyone on that event's call list with: name, phone, email, current RSVP status, last called date, last caller.
- **Click-to-call:** phone numbers are clickable links (`tel:`) that open the device's phone app / softphone.
- **One-click status update:** buttons or a dropdown right on the row to set No Data / Confirmed / Tentative / Reconfirmed / Declined.
- **Call notes:** add a quick note from the row or from a side panel.
- Filters: by RSVP status (e.g., show only No Data so callers work untouched people first), by "not called in X days."
- Counts at the top: total, No Data, Confirmed, Tentative, Reconfirmed, Declined.
- Declined rows are clearly marked but remain in the list.
- Opening a row shows the contact's event history so callers can see things like "attended 3 times, no-showed last time" before dialing.

### 5.5 Event-day sign-in screen

For the event happening today:

- Big, fast, touch-friendly list built for a tablet or laptop at a sign-in table.
- Search box at the top: type part of a name or phone number to find someone instantly.
- One tap to mark **Attended**. Undo available.
- Shows each person's RSVP status alongside so staff can see who was expected.
- **Add walk-in:** a quick form (first name, last name, phone, email) that creates a new contact (Source = `Walk-in`), adds them to this event, and marks them **Attended** in one step. Before creating, it checks for an existing contact with the same phone or email and offers to use that record instead.
- Live counter: checked in vs. expected (Confirmed + Reconfirmed + Tentative).
- **Close out event** button: shows everyone expected who isn't checked in, lets staff confirm, then marks them **No-Show** and sets the event to Completed.

### 5.6 Reporting (simple, v1)

- Per event: counts by RSVP status and by attendance; show rate (attended ÷ confirmed).
- Per caller: number of calls logged and confirmations for an event.
- Export any list (call list, attendance list, contacts) to CSV.

## 6. Non-Functional Requirements

- **Web app**, works in a desktop browser and on a tablet/phone browser (sign-in screen especially).
- **Login required.** Each user has their own account so we know who changed what.
- **Audit trail:** every status change stores who and when.
- **Image and file storage:** uploaded images and files are stored in file storage (not inside the database), resized for thumbnails, with a size limit (suggest 10 MB per image, 25 MB per PDF).
- **Speed:** search on the sign-in screen should feel instant for a list of a few thousand contacts.
- **Data safety:** contact data is personal information. No public pages; nothing accessible without logging in.

> **Open decision:** Tech stack and hosting. **Default suggestion for Claude Code:** a standard full-stack web app (for example Next.js + a SQL database such as Postgres or SQLite) with simple email/password login. Claude Code should propose the stack before building.

## 7. Out of Scope for v1

- Automated texting or emailing of invites/reminders
- Built-in calling (the app only launches the phone dialer)
- Online self-registration pages for attendees
- QR-code check-in
- Multiple organizations/tenants

## 8. Acceptance Criteria

1. Admin can import a CSV/XLSX of contacts, map columns, preview, and see a summary of added/updated/skipped/error rows. Duplicates by phone or email are detected.
2. Admin can create an event with the fields in section 3.2, including a cover image, and see it on a Facebook-style event page. Admin can populate its call list from all contacts or a filtered set.
3. A caller can open an event's call list, tap a phone number to start a call, set any RSVP status in one click, and add a note. The change shows who made it and when.
4. Declined contacts remain on the call list, are visibly flagged, and can be changed to another status.
5. Opening any contact shows every event they were registered for, with RSVP and attendance for each.
6. On event day, sign-in staff can search and mark someone Attended in two taps or fewer.
7. Sign-in staff can add a walk-in, who becomes a contact, is added to the event, and is marked Attended — with a duplicate check first.
8. Closing out an event marks remaining expected attendees as No-Show after staff confirm, and sets the event to Completed.
9. Users must log in; nothing is viewable without logging in.
10. Any list can be exported to CSV.

## 9. Open Questions

1. Which event fields in 3.2 are must-haves for v1 vs. later? (Default: build them all; only name, start date/time, time zone, location type, host, status, and visibility are required.)
2. Separate permissions per role, or one shared level of access?
3. Should an event's call list automatically pull in only past attendees, or everyone in the database?
4. Should No-Show history affect who gets called next time (e.g., deprioritize repeat no-shows)?
5. Tech stack and where it's hosted.
