import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { hashPassword } from "./password";

export type Exec = (
  text: string,
  params: unknown[],
) => Promise<{ rows: Record<string, unknown>[]; count: number }>;

/**
 * Demo data. Runs automatically for the local dev database, and via
 * `npm run db:setup -- --seed` for Supabase. Call inside a transaction.
 */
export async function seed(exec: Exec) {
  const toPg = (sql: string) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  const q = (sql: string, params: unknown[] = []) => exec(toPg(sql), params);
  const ins = async (sql: string, params: unknown[]) => Number((await q(`${sql} RETURNING id`, params)).rows[0].id);
  let s = 42;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const tz = "America/New_York";

  const atDaysFromToday = (days: number, time: string) => {
    const d = new Date(Date.now() + days * 864e5);
    const date = formatInTimeZone(d, tz, "yyyy-MM-dd");
    return fromZonedTime(`${date}T${time}`, tz).toISOString();
  };

  {
    const pw = hashPassword("password");
    const addUser = (...a: unknown[]) => ins("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)", a);
    const admin = await addUser("Wes Boucher", "admin@example.com", pw, "admin");
    const caller1 = await addUser("Dana Ortiz", "caller@example.com", pw, "caller");
    const caller2 = await addUser("Marcus Hill", "marcus@example.com", pw, "caller");
    const signin = await addUser("Sam Lee", "signin@example.com", pw, "signin");
    const callers = [admin, caller1, caller2];

    for (const c of ["Networking", "Workshop", "Social", "Fundraiser", "Meeting"]) {
      await q("INSERT INTO categories (name) VALUES (?)", [c]);
    }

    const first = "James Mary Robert Patricia John Jennifer Michael Linda David Elizabeth William Barbara Richard Susan Joseph Jessica Thomas Sarah Carlos Karen Daniel Lisa Matthew Nancy Anthony Betty Mark Sandra Donald Ashley Steven Kimberly Andrew Emily Paul Donna Joshua Michelle Kenneth Carol Kevin Amanda Brian Melissa George Deborah Timothy Stephanie Ronald Rebecca Jason Sharon Edward Laura Jeffrey Cynthia Ryan Amy Jacob Angela Gary Shirley Nicholas Brenda Eric Emma Jonathan Anna Stephen Pamela Larry Nicole Justin Samantha Scott Katherine Brandon Christine Benjamin Debra Samuel Rachel Gregory Carolyn Alexander Janet Patrick Maria Frank Olivia Raymond Heather Jack Helen Dennis Catherine Jerry Diane Tyler Julie Aaron Victoria Jose Joyce Adam Lauren Nathan Kelly Henry Christina Zachary Ruth Douglas Joan Peter Virginia Kyle Judith Noah Evelyn Ethan Hannah Jeremy Andrea Walter Megan Christian Cheryl Keith Jacqueline Roger Martha Terry Madison Austin Teresa Sean Gloria Gerald Sara Carl Janice Harold Ann Dylan Kathryn Arthur Abigail Lawrence Sophia Jordan Frances Jesse Jean Bryan Alice Billy Judy Bruce Isabella Gabriel Julia Joe Grace Logan Amber Alan Denise Juan Danielle Albert Marilyn Willie Beverly Elijah Charlotte Wayne Natalie Randy Theresa Vincent Diana Mason Brittany Roy Doris Ralph Kayla Bobby Alexis Russell Lori Bradley Marie".split(" ");
    const last = "Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez Gonzalez Wilson Anderson Thomas Taylor Moore Jackson Martin Lee Perez Thompson White Harris Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright Scott Torres Nguyen Hill Flores Green Adams Nelson Baker Hall Rivera Campbell Mitchell Carter Roberts Gomez Phillips Evans Turner Diaz Parker Cruz Edwards Collins Reyes Stewart Morris Morales Murphy Cook Rogers Gutierrez Ortiz Morgan Cooper Peterson Bailey Reed Kelly Howard Ramos Kim Cox Ward Richardson Watson Brooks Chavez Wood James Bennett Gray Mendoza Ruiz Hughes Price Alvarez Castillo Sanders Patel Myers Long Ross Foster Jimenez".split(" ");
    const streets = ["Bayshore Blvd", "Kennedy Blvd", "Dale Mabry Hwy", "Swann Ave", "Howard Ave", "Florida Ave", "Nebraska Ave", "Platt St", "Davis Blvd", "Fowler Ave"];
    const cities = ["Tampa", "Tampa", "Tampa", "St. Petersburg", "Clearwater", "Brandon", "Riverview", "Wesley Chapel"];
    const domains = ["gmail.com", "yahoo.com", "outlook.com", "icloud.com", "hotmail.com"];

    const addContact = (...a: unknown[]) => ins(
      `INSERT INTO contacts (first_name, last_name, phone, email, street, city, state, zip, notes, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a,
    );
    const contactIds: number[] = [];
    const seen = new Set<string>();
    while (contactIds.length < 160) {
      const fn = pick(first);
      const ln = pick(last);
      if (seen.has(fn + ln)) continue;
      seen.add(fn + ln);
      const phone = rand() < 0.93 ? `${pick(["813", "727", "813", "941"])}555${String(Math.floor(rand() * 10000)).padStart(4, "0")}` : "";
      const email = phone === "" || rand() < 0.85 ? `${fn}.${ln}${Math.floor(rand() * 90 + 10)}@${pick(domains)}`.toLowerCase() : "";
      const hasAddr = rand() < 0.55;
      const created = new Date(Date.now() - (200 + rand() * 200) * 864e5).toISOString();
      const id = await addContact(
        fn,
        ln,
        phone,
        email,
        hasAddr ? `${Math.floor(rand() * 9000 + 100)} ${pick(streets)}` : "",
        hasAddr ? pick(cities) : "",
        hasAddr ? "FL" : "",
        hasAddr ? `336${String(Math.floor(rand() * 40)).padStart(2, "0")}` : "",
        rand() < 0.08 ? pick(["Prefers texts over calls.", "Best reached after 5pm.", "Brings a guest most times.", "Spanish speaker — ask for Carlos to call.", "Volunteer at the Spring Mixer."]) : "",
        "import",
        created,
        created,
      );
      contactIds.push(id);
    }

    const addEvent = (...a: unknown[]) => ins(
      `INSERT INTO events (name, tagline, description, category, tags, status, start_at, end_at, doors_at, time_zone, rsvp_deadline,
         location_type, venue_name, street, city, state, zip, room, parking_info, accessibility, hosts, contact_name, contact_phone,
         contact_email, speakers, sponsors, capacity, admission, price_tiers, age_restriction, dress_code, food_drinks,
         plus_ones_allowed, max_guests, agenda, caller_script, signin_instructions, created_by, online_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a,
    );

    type E = {
      name: string; tagline: string; category: string; days: number; time: string; endTime: string; status: string;
      venue: string; street: string; capacity: number | null; size: number; tags: string[]; online?: string;
    };
    const events: E[] = [
      { name: "Spring Mixer", tagline: "Kick off the season with neighbors, snacks, and live music.", category: "Social", days: -182, time: "18:00", endTime: "21:00", status: "completed", venue: "The Oxford Exchange", street: "420 W Kennedy Blvd", capacity: 120, size: 95, tags: ["community", "music"] },
      { name: "Budgeting 101 Workshop", tagline: "A hands-on evening on building a household budget that sticks.", category: "Workshop", days: -124, time: "18:30", endTime: "20:30", status: "completed", venue: "Tampa Public Library — Main", street: "900 N Ashley Dr", capacity: 60, size: 70, tags: ["finance", "education"] },
      { name: "Summer Social", tagline: "Lawn games, food trucks, and a sunset on the river.", category: "Social", days: -77, time: "17:00", endTime: "20:00", status: "completed", venue: "Curtis Hixon Park", street: "600 N Ashley Dr", capacity: null, size: 110, tags: ["outdoors", "family"] },
      { name: "Fall Fundraiser Gala", tagline: "An evening in support of the youth scholarship fund.", category: "Fundraiser", days: -31, time: "19:00", endTime: "23:00", status: "completed", venue: "Tampa Garden Club", street: "2629 Bayshore Blvd", capacity: 150, size: 120, tags: ["gala", "scholarships"] },
      { name: "Autumn Networking Night", tagline: "Meet local business owners over coffee and dessert.", category: "Networking", days: 0, time: "18:00", endTime: "20:30", status: "published", venue: "Armature Works — Heights Room", street: "1910 N Ola Ave", capacity: 90, size: 85, tags: ["business", "networking"] },
      { name: "Holiday Open House", tagline: "Cocoa, carols, and a toy drive for families in need.", category: "Social", days: 21, time: "16:00", endTime: "19:00", status: "published", venue: "Community Center at Riverside", street: "1520 W Main St", capacity: 140, size: 160, tags: ["holiday", "family", "toy drive"] },
    ];

    const description = (e: E) =>
      `Join us for **${e.name}** — ${e.tagline.charAt(0).toLowerCase()}${e.tagline.slice(1)}\n\nWhat to expect:\n\n- A warm welcome and name tags at the door\n- Time to meet new people and catch up with old friends\n- Light refreshments throughout\n\nQuestions? Reach out to the event contact below.`;

    const insertReg = (...a: unknown[]) =>
      ins(
        `INSERT INTO registrations (event_id, contact_id, rsvp, attendance, guest_of, walk_in, last_called_at, called_by, checked_in_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        a,
      );
    const insertChange = (...a: unknown[]) =>
      q("INSERT INTO status_changes (registration_id, kind, from_value, to_value, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", a);
    const insertCall = (...a: unknown[]) => q("INSERT INTO call_logs (registration_id, user_id, created_at) VALUES (?, ?, ?)", a);
    const insertNote = (...a: unknown[]) =>
      q("INSERT INTO call_notes (registration_id, user_id, body, created_at) VALUES (?, ?, ?, ?)", a);
    const staff = (...a: unknown[]) => q("INSERT INTO event_staff (event_id, user_id, role) VALUES (?, ?, ?)", a);
    const notes = ["Left voicemail.", "Excited to come, bringing spouse.", "Asked about parking.", "Call back Thursday evening.", "Not sure about work schedule.", "Said maybe — will text back.", "Coming with two coworkers.", "Wrong number? Spoke to a relative.", "Moved out of state.", "Wants the flyer emailed."];

    // Contacts who habitually no-show, so history is interesting.
    const flaky = new Set(contactIds.filter(() => rand() < 0.15));

    for (const e of events) {
      const start = atDaysFromToday(e.days, e.time);
      const end = atDaysFromToday(e.days, e.endTime);
      const doors = new Date(Date.parse(start) - 30 * 60e3).toISOString();
      const deadline = new Date(Date.parse(start) - 3 * 864e5).toISOString();
      const isHoliday = e.name === "Holiday Open House";
      const eventId = await addEvent(
          e.name, e.tagline, description(e), e.category, JSON.stringify(e.tags), e.status, start, end, doors, tz, deadline,
          "in_person", e.venue, e.street, "Tampa", "FL", "33602", "",
          "Free parking in the main lot; overflow on the street.", "Wheelchair accessible entrance on the north side. Elevator to all floors.",
          JSON.stringify(["Wes Boucher"]), "Wes Boucher", "8135550100", "admin@example.com",
          JSON.stringify(isHoliday ? [
            { name: "Rev. Alicia Moore", title: "Riverside Community Church", bio: "Leads the annual toy drive and has served the Riverside neighborhood for 15 years.", photo: "" },
            { name: "Tony Ramirez", title: "Owner, Ramirez Bakery", bio: "Supplying the cocoa bar and cookies for the third year running.", photo: "" },
          ] : []),
          JSON.stringify(isHoliday ? [{ name: "Ramirez Bakery", logo: "", url: "https://example.com" }, { name: "Bay Area Credit Union", logo: "", url: "https://example.com" }] : []),
          e.capacity, "free", "[]", "all", isHoliday ? "Festive casual" : "", isHoliday ? "Cocoa bar and cookies" : "Light refreshments",
          1, 2,
          JSON.stringify(isHoliday ? [
            { time: "4:00 PM", title: "Doors open & cocoa bar", description: "", speaker: "" },
            { time: "4:30 PM", title: "Welcome", description: "A few words about the year.", speaker: "Wes Boucher" },
            { time: "5:00 PM", title: "Carols & toy drive", description: "Bring an unwrapped toy.", speaker: "Rev. Alicia Moore" },
            { time: "6:30 PM", title: "Raffle & thank-yous", description: "", speaker: "" },
          ] : []),
          `Hi, this is [your name] calling from the community team! We're hosting ${e.name} on [date] at ${e.venue}. ${e.tagline}\n\n• Can we count on you to come?\n• Will you be bringing a guest? (up to 2)\n• Any questions about parking or access?\n\nIf they say maybe: offer to call back a few days before.`,
          "Greet everyone by name, hand out a name tag, and point them to the coffee bar. Walk-ins: add them with the + button.",
          admin, "",
      );
      await staff(eventId, caller1, "caller");
      await staff(eventId, caller2, "caller");
      await staff(eventId, signin, "signin");

      const isPast = e.days < 0;
      const isToday = e.days === 0;
      const pool = [...contactIds].sort(() => rand() - 0.5).slice(0, Math.min(e.size, contactIds.length));
      const regCreated = new Date(Date.parse(start) - 25 * 864e5).toISOString();

      for (const cid of pool) {
        // Upcoming event is still being worked: ~40% untouched.
        const touched = isPast || isToday ? rand() < 0.92 : rand() < 0.6;
        let rsvp = "no_data";
        if (touched) {
          const r = rand();
          rsvp = r < 0.42 ? "confirmed" : r < 0.6 ? "tentative" : r < 0.78 ? "reconfirmed" : r < 0.93 ? "declined" : "no_data";
        }
        let attendance = "pending";
        let checkedIn: string | null = null;
        if (isPast) {
          const expected = ["confirmed", "tentative", "reconfirmed"].includes(rsvp);
          const showChance = flaky.has(cid) ? 0.25 : rsvp === "reconfirmed" ? 0.92 : rsvp === "confirmed" ? 0.8 : rsvp === "tentative" ? 0.5 : 0.05;
          if (rand() < showChance) {
            attendance = "attended";
            checkedIn = new Date(Date.parse(start) + rand() * 45 * 60e3).toISOString();
          } else if (expected) attendance = "no_show";
        }
        const caller = pick(callers);
        const calledAt = touched ? new Date(Date.parse(start) - (2 + rand() * 18) * 864e5).toISOString() : null;
        const regId = await insertReg(eventId, cid, rsvp, attendance, null, 0, calledAt, touched ? caller : null, checkedIn, regCreated);

        // Some people bring a named guest, who becomes a contact of their own.
        if (rsvp !== "no_data" && rsvp !== "declined" && rand() < 0.2) {
          const gFirst = pick(first);
          const gLast = rand() < 0.5 ? (await q("SELECT last_name FROM contacts WHERE id = ?", [cid])).rows[0].last_name : pick(last);
          const guestId = await ins(
            "INSERT INTO contacts (first_name, last_name, source, created_at, updated_at) VALUES (?, ?, 'guest', ?, ?)",
            [gFirst, gLast, calledAt, calledAt],
          );
          const gAttendance = attendance === "attended" ? (rand() < 0.85 ? "attended" : "no_show") : attendance;
          const gReg = await insertReg(eventId, guestId, rsvp, gAttendance, regId, 0, null, null, gAttendance === "attended" ? checkedIn : null, calledAt);
          if (gAttendance !== "pending") await insertChange(gReg, "attendance", "pending", gAttendance, signin, checkedIn ?? end);
        }
        if (touched && calledAt) {
          await insertCall(regId, caller, calledAt);
          if (rsvp !== "no_data") await insertChange(regId, "rsvp", "no_data", rsvp, caller, calledAt);
          if (rand() < 0.3) await insertNote(regId, caller, pick(notes), calledAt);
          if (rsvp === "reconfirmed") await insertChange(regId, "rsvp", "confirmed", "reconfirmed", caller, calledAt);
        }
        if (attendance !== "pending") {
          await insertChange(regId, "attendance", "pending", attendance, signin, checkedIn ?? end);
        }
      }

      // A few walk-ins at past events
      if (isPast) {
        const extras = contactIds.filter((c) => !pool.includes(c)).slice(0, Math.floor(rand() * 5) + 2);
        for (const cid of extras) {
          const at = new Date(Date.parse(start) + rand() * 60 * 60e3).toISOString();
          const regId = await insertReg(eventId, cid, "no_data", "attended", null, 1, null, null, at, at);
          await insertChange(regId, "attendance", "pending", "attended", signin, at);
        }
      }
      // Today's event: a few people already checked in
      if (isToday) {
        await q(
          `UPDATE registrations SET attendance = 'attended', checked_in_at = ?
            WHERE id IN (SELECT id FROM registrations WHERE event_id = ? AND rsvp IN ('confirmed','reconfirmed') ORDER BY id LIMIT 6)`,
          [new Date().toISOString(), eventId],
        );
      }
    }
  }
}
