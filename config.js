/* ============================================================
   config.js
   ------------------------------------------------------------
   This is the ONLY file you need to edit before the app works
   with cloud saving. Everything else you can leave alone while
   you're learning.

   WHAT IS JSONBIN?
   JSONBin.io is a free service that gives you a little "bucket"
   on the internet where you can store JSON data (which is just
   text). Our app will read and write your tasks to that bucket,
   so your data:
     - is saved permanently (not just in one browser)
     - can be opened on your phone's Notion app too, because
       Notion just loads this page from the internet and the
       page talks to JSONBin over the internet as well.

   HOW TO GET YOUR OWN BIN_ID AND ACCESS_KEY:
   1. Go to https://jsonbin.io and create a free account.
   2. Click "Create Bin". Paste this starter JSON into it:
        { "tasks": [], "instances": {}, "categories": [] }
      Save it.
   3. After saving, look at the URL or the bin details panel —
      you'll see a Bin ID, something like 64f1c2.... Copy it into
      BIN_ID below.
   4. Go to your account's "Access Keys" section (NOT "API Keys" /
      X-Master-Key — we intentionally don't use that one, see the
      security note below) and click "Create Access Key". Give it
      a name, and under permissions:
        - Scope it to just this one bin (not "All Bins")
        - Only enable "Bin > Read" and "Bin > Update" — leave
          Create and Delete unchecked, since the app never needs
          to create new bins or delete this one.
      Copy the generated key (it starts with "$2a$10$...") into
      ACCESS_KEY below.
   5. Save this file. That's it — the app will now sync to your
      bin automatically every time you make a change.

   IMPORTANT SECURITY NOTE — WHY AN ACCESS KEY INSTEAD OF THE
   MASTER KEY:
   Because this app is a static front-end page (no server of its
   own), this key will be visible to anyone who views your page's
   source code. Your account's Master Key (X-Master-Key) can
   create, read, update, and delete EVERY bin in your account —
   so it should never be shipped inside client-side code. A
   scoped Access Key (X-Access-Key) is the safer option: JSONBin
   lets you restrict it to exactly one bin and exactly the
   permissions this app needs (read + update). If someone ever
   found this key, the worst they could do is read or overwrite
   this one task-tracker bin — not touch anything else in your
   account.
   ============================================================ */

const JSONBIN_CONFIG = {
  // Paste your Bin ID between the quotes below:
  BIN_ID: "6a924848da38895dfe1ec359",

  // Paste your scoped X-Access-Key (NOT the Master Key) between the quotes below:
  ACCESS_KEY: "$2a$10$3gGri8xlWMFavz4rrsCPFeUVsLo.iRFQ/7ooBrDLiAGgQqtQGVAnG",

  // You shouldn't need to change this:
  BASE_URL: "https://api.jsonbin.io/v3/b",
};
