/* =============================================================================
 * Soddy-Daisy High School — Class of 1993
 * CLASS DATA FILE
 * -----------------------------------------------------------------------------
 * This one file drives the entire site. To load your real roster:
 *
 *   1. In Class Creator: Manage Classmates -> Download Class List -> export
 *      to Excel/CSV with the fields you want.
 *   2. Send me that file and I'll fill in the `classmates` array below
 *      automatically. Or edit it by hand using the shape shown.
 *
 * Every field is optional except `name`. Missing photos fall back to a
 * generated initials avatar, so the site always looks complete.
 * ========================================================================== */

window.CLASS_DATA = {
  // ---- Site identity -------------------------------------------------------
  site: {
    school: "Soddy-Daisy High School",
    town: "Soddy-Daisy, Tennessee",
    classYear: 1993,
    mascot: "Trojans",
    // Class colors — tweak to match the real ones.
    colors: { primary: "#1f3a5f", accent: "#c8a24a" },
    tagline: "Thirty-plus years, one class, still connected.",
  },

  // ---- Reunion / events hub ------------------------------------------------
  reunion: {
    // Set `date` to an ISO string to switch on the countdown, or null to hide.
    title: "Class of 1993 Reunion",
    date: null,                       // e.g. "2028-08-19T18:00:00"
    location: "TBD — Soddy-Daisy, TN",
    blurb: "Details are being finalized. Check back soon, and update your " +
           "profile so we can reach you.",
    rsvpUrl: null,                    // link to a Google Form / Eventbrite, etc.
    pastReunions: [
      { year: 2003, label: "10-Year Reunion", photos: 0 },
      { year: 2013, label: "20-Year Reunion", photos: 0 },
      { year: 2018, label: "25-Year Reunion", photos: 0 },
    ],
  },

  /* ---- Classmates ----------------------------------------------------------
   * status: "active"  -> shows in the directory
   *         "missing" -> shows in the "Help Us Find" list
   *         "memory"  -> shows on the In Memory page
   *
   * Fields (all optional but name):
   *   name, maidenName, city, state, bio,
   *   photoThen (yearbook), photoNow (recent),
   *   status, passedYear (for memory), quote
   * ------------------------------------------------------------------------ */
  classmates: [
    // ---- SAMPLE ROWS (placeholder — replace with your export) -------------
    {
      name: "Sample Classmate",
      maidenName: "",
      city: "Chattanooga",
      state: "TN",
      status: "active",
      bio: "This is a sample profile so you can see how a card looks. " +
           "Your real classmates will appear here.",
      photoThen: "",
      photoNow: "",
    },
    {
      name: "Another Trojan",
      city: "Nashville",
      state: "TN",
      status: "active",
      bio: "Cards are searchable and filterable, and work great on a phone.",
    },
    {
      name: "Still Looking For You",
      status: "missing",
      bio: "Classmates we've lost touch with show up here so the group can " +
           "help reconnect.",
    },
    {
      name: "In Loving Memory",
      status: "memory",
      passedYear: null,
      quote: "Remembered by the Class of 1993.",
    },
  ],

  // ---- Then & Now gallery --------------------------------------------------
  // Optional curated highlights. Cards with both photoThen + photoNow above
  // are also auto-collected into the gallery.
  gallery: [],
};
