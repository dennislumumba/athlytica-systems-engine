/* =====================================================================
 * NRHL × ATHLYTICA — nairobihockey.com integration bundle
 *
 * WHY VANILLA, NOT REACT: nairobihockey.com is a single static
 * index.html served from tiiny.site. There is no bundler, no package
 * manager, no server, and no repository. Introducing React + a build
 * pipeline to render three read-only tables would replace a two-file
 * deploy with a toolchain, for markup the platform renders natively.
 * If the site later becomes a Next app, the fetch/render functions
 * below port to components unchanged — the data contract is the same.
 *
 * WHY NO PAYMENT GATEWAY LIVES HERE: Athlytica HQ already owns the
 * M-Pesa rail — STK push, the Daraja settlement callback, MSISDN
 * hashing, the idempotent settlement RPC, and the reconciliation
 * ledger. A second gateway on a static host would mean a second set of
 * secrets (unprotectable in client-side JS) and a second version of the
 * truth about who paid. Checkout posts to HQ and HQ stays authoritative.
 *
 * INSTALL — three lines in index.html, nothing removed:
 *   <link rel="stylesheet" href="nrhl-athlytica.css">
 *   <script defer src="nrhl-athlytica.js"></script>
 * and mount points where the content should appear:
 *   <div data-nrhl="pillars"></div>
 *   <div data-nrhl="timeline"></div>
 *   <div data-nrhl="standings"></div>
 *   <div data-nrhl="leaderboard"></div>
 *   <div data-nrhl="verify"></div>
 *   <div data-nrhl="packages"></div>
 * Any mount point you omit simply does not render.
 * ===================================================================== */

(function () {
  "use strict";

  // SAME-ORIGIN by default. nrhl-site's vercel.json rewrites
  // /api/v1/:path* to the engine, so the browser never makes a
  // cross-origin request and CORS is never in the way. Override with
  // ?api=http://localhost:3000/api/v1 to test against a local engine.
  var API = new URLSearchParams(window.location.search).get("api") || "/api/v1";

  var DIVISIONS = ["The Summit", "The Ridge", "The Plateau", "The Savannah"];

  var PILLARS = [
    { name: "Speed", copy: "10 m dash, top-speed carry, acceleration profile." },
    { name: "Agility", copy: "5-10-5 shuttle, figure-8, crossover quality, lateral asymmetry." },
    { name: "Stamina", copy: "Work rate, perceived exertion, session load, attendance adherence." },
    { name: "Technical Skill", copy: "Technical precision, full extension, low centre of gravity, target accuracy." },
    {
      name: "Cognitive / Tactical Intelligence",
      copy: "Scan rate, blind-pass rate, shared-goal share, static violations, weak-side usage.",
    },
  ];

  var TIMELINE = [
    {
      window: "Aug – Oct 2026",
      title: "Pre-Season Selection Combine & Skill Phase",
      copy: "Every athlete is profiled across the five pillars and issued a Digital Scouting Passport. Combine participation is mandatory for draft eligibility.",
    },
    {
      window: "Nov – Dec 2026",
      title: "Roster Drafting & Final Seeding",
      copy: "Combine data seeds athletes into conference squads, balanced on composite performance. Rosters lock at the end of the window.",
    },
    {
      window: "January 2027",
      title: "Official League Opening Matchday",
      copy: "Season 1 breaks puck on professional-grade modular inline surfaces across all four conferences.",
    },
  ];

  // -------------------------------------------------------------- utils

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /** textContent everywhere — no innerHTML with remote data, ever. */
  function cell(row, text, opts) {
    var td = el(opts && opts.head ? "th" : "td", opts && opts.className, text);
    if (opts && opts.numeric) td.classList.add("na-num");
    row.appendChild(td);
    return td;
  }

  function mount(name) {
    return document.querySelector('[data-nrhl="' + name + '"]');
  }

  function section(host, title, subtitle) {
    host.innerHTML = "";
    var wrap = el("div", "na-block");
    wrap.appendChild(el("h3", "na-title", title));
    if (subtitle) wrap.appendChild(el("p", "na-sub", subtitle));
    host.appendChild(wrap);
    return wrap;
  }

  function statusLine(host, text) {
    var p = el("p", "na-status", text);
    host.appendChild(p);
    return p;
  }

  function kes(n) {
    return "KES " + Number(n).toLocaleString("en-KE");
  }

  /** ^(?:\+?254|0)([17]\d{8})$ — the same rule Athlytica HQ enforces. */
  function toE164(input) {
    var match = /^(?:\+?254|0)([17]\d{8})$/.exec(String(input).replace(/[\s\-()]/g, ""));
    return match ? "+254" + match[1] : null;
  }

  var feedPromise = null;
  function feed() {
    if (!feedPromise) {
      feedPromise = fetch(API + "/public/nrhl", { mode: "cors" }).then(function (r) {
        if (!r.ok) throw new Error("Feed unavailable (" + r.status + ")");
        return r.json();
      });
    }
    return feedPromise;
  }

  // ---------------------------------------------------- static sections

  function renderPillars() {
    var host = mount("pillars");
    if (!host) return;
    var wrap = section(
      host,
      "Measured across five pillars",
      "NRHL runs on Athlytica HQ's Universal Taxonomy Engine. Every athlete carries the same five-pillar profile, captured the same way, every session.",
    );
    var grid = el("div", "na-grid");
    PILLARS.forEach(function (p) {
      var card = el("div", "na-card");
      card.appendChild(el("strong", "na-card-title", p.name));
      card.appendChild(el("p", "na-card-copy", p.copy));
      grid.appendChild(card);
    });
    wrap.appendChild(grid);

    var note = el(
      "p",
      "na-note",
      "Scoring follows the league's own law: a goal built through a teammate scores 3, a solo goal scores 1, an assist scores 1. Shared attack is worth four times a solo finish, by design.",
    );
    wrap.appendChild(note);
  }

  function renderTimeline() {
    var host = mount("timeline");
    if (!host) return;
    var wrap = section(host, "The road to the January 2027 draft", null);
    var list = el("ol", "na-timeline");
    TIMELINE.forEach(function (phase) {
      var li = el("li", "na-phase");
      li.appendChild(el("span", "na-phase-window", phase.window));
      li.appendChild(el("strong", "na-phase-title", phase.title));
      li.appendChild(el("p", "na-card-copy", phase.copy));
      list.appendChild(li);
    });
    wrap.appendChild(list);
  }

  // ------------------------------------------------------------ widgets

  function renderStandings() {
    var host = mount("standings");
    if (!host) return;
    var wrap = section(
      host,
      "Live division standings",
      "Conferences: " + DIVISIONS.join(" · ") + ".",
    );
    var status = statusLine(wrap, "Loading standings…");

    feed()
      .then(function (data) {
        status.remove();
        if (!data.standings || data.standings.length === 0) {
          statusLine(
            wrap,
            "Standings open with the first scored fixture of Season 1 in January 2027. Pre-season combine results are not league results.",
          );
          return;
        }

        var filter = el("select", "na-select");
        var all = el("option");
        all.value = "";
        all.textContent = "All conferences";
        filter.appendChild(all);
        DIVISIONS.forEach(function (d) {
          var opt = el("option", null, d);
          opt.value = d;
          filter.appendChild(opt);
        });
        wrap.appendChild(filter);

        var table = el("table", "na-table");
        var thead = el("thead");
        var headRow = el("tr");
        ["Team", "Conference", "GP", "W", "OTW", "L", "OTL", "GF", "GA", "GD", "PTS"].forEach(
          function (h, i) {
            cell(headRow, h, { head: true, numeric: i > 1 });
          },
        );
        thead.appendChild(headRow);
        table.appendChild(thead);
        var tbody = el("tbody");
        table.appendChild(tbody);
        wrap.appendChild(table);

        function draw() {
          tbody.innerHTML = "";
          data.standings
            .filter(function (s) {
              return !filter.value || s.division === filter.value;
            })
            .forEach(function (s) {
              var tr = el("tr");
              cell(tr, s.team);
              cell(tr, s.division);
              [s.gp, s.w, s.otW, s.l, s.otL, s.gf, s.ga].forEach(function (v) {
                cell(tr, v, { numeric: true });
              });
              cell(tr, (s.gd > 0 ? "+" : "") + s.gd, { numeric: true });
              cell(tr, s.pts, { numeric: true, className: "na-strong" });
              tbody.appendChild(tr);
            });
          if (!tbody.children.length) {
            var tr = el("tr");
            cell(tr, "No results in this conference yet.").colSpan = 11;
            tbody.appendChild(tr);
          }
        }
        filter.addEventListener("change", draw);
        draw();
      })
      .catch(function (err) {
        status.textContent = "Standings are temporarily unavailable. " + err.message;
      });
  }

  function renderLeaderboard() {
    var host = mount("leaderboard");
    if (!host) return;
    var wrap = section(
      host,
      "Top performers",
      "Points are weighted: 3 × assisted goals + 1 × solo goal + 1 × assist.",
    );
    var status = statusLine(wrap, "Loading leaderboard…");

    feed()
      .then(function (data) {
        status.remove();
        var rows = (data.leaderboard || []).slice(0, 10);
        if (rows.length === 0) {
          statusLine(wrap, "The leaderboard fills as combine scrimmages are logged.");
          return;
        }

        var table = el("table", "na-table");
        var thead = el("thead");
        var headRow = el("tr");
        ["#", "Athlete", "GP", "G", "A", "PTS", "SV%"].forEach(function (h, i) {
          cell(headRow, h, { head: true, numeric: i > 1 });
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        var tbody = el("tbody");
        rows.forEach(function (r, i) {
          var tr = el("tr");
          cell(tr, i + 1, { numeric: true });
          cell(tr, r.name);
          cell(tr, r.gamesPlayed, { numeric: true });
          cell(tr, r.goals === null ? "—" : r.goals, { numeric: true });
          cell(tr, r.assists === null ? "—" : r.assists, { numeric: true });
          cell(tr, r.points, { numeric: true, className: "na-strong" });
          cell(tr, r.savePct === null ? "—" : r.savePct, { numeric: true });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);

        wrap.appendChild(
          el(
            "p",
            "na-note",
            "Athletes appear by code rather than name unless their guardian granted marketing consent. That election is explicit and is never assumed.",
          ),
        );
      })
      .catch(function (err) {
        status.textContent = "Leaderboard temporarily unavailable. " + err.message;
      });
  }

  function renderVerify() {
    var host = mount("verify");
    if (!host) return;
    var wrap = section(
      host,
      "Verify an athlete passport",
      "Enter an athlete code to confirm active league registration and clearance status.",
    );

    var form = el("form", "na-verify");
    var input = el("input", "na-input");
    input.type = "text";
    input.placeholder = "ATH-00047";
    input.setAttribute("aria-label", "Athlete code");
    input.autocomplete = "off";
    var button = el("button", "na-btn", "Verify");
    button.type = "submit";
    form.appendChild(input);
    form.appendChild(button);
    wrap.appendChild(form);

    var out = el("div", "na-result");
    wrap.appendChild(out);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var code = input.value.trim().toUpperCase();
      out.innerHTML = "";
      if (!/^ATH-\d{5}$/.test(code)) {
        out.appendChild(el("p", "na-bad", "Athlete codes look like ATH-00047."));
        return;
      }
      out.appendChild(el("p", "na-status", "Checking…"));
      fetch(API + "/public/nrhl/verify?code=" + encodeURIComponent(code), { mode: "cors" })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          out.innerHTML = "";
          if (!data.found) {
            out.appendChild(el("p", "na-bad", code + " is not a registered NRHL athlete code."));
            return;
          }
          var card = el("div", "na-card");
          card.appendChild(el("strong", "na-card-title", data.name || data.code));
          var facts = el("ul", "na-facts");
          [
            ["Athlete code", data.code],
            ["Registration", "Active"],
            ["Performance ID", data.passportIssued ? "Issued" : "Pending combine"],
            ["Certification", data.certified ? data.certificateTier : "Not yet certified"],
            ["Conference", data.conference || "Awaiting seeding"],
            ["Squad", data.squad || "Undrafted"],
          ].forEach(function (pair) {
            var li = el("li");
            li.appendChild(el("span", "na-fact-k", pair[0]));
            li.appendChild(el("span", "na-fact-v", pair[1]));
            facts.appendChild(li);
          });
          card.appendChild(facts);
          card.appendChild(el("p", "na-card-copy", data.note));
          out.appendChild(card);
        })
        .catch(function () {
          out.innerHTML = "";
          out.appendChild(el("p", "na-bad", "Verification is temporarily unavailable."));
        });
    });
  }

  // ----------------------------------------------------------- checkout

  function renderPackages() {
    var host = mount("packages");
    if (!host) return;
    var wrap = section(
      host,
      "Pre-season packages",
      "One-time fee for the Aug–Oct 2026 selection phase. Combine participation is mandatory for January 2027 draft eligibility.",
    );
    var status = statusLine(wrap, "Loading packages…");

    feed()
      .then(function (data) {
        status.remove();
        var grid = el("div", "na-grid");
        (data.tiers || []).forEach(function (tier) {
          var card = el("div", "na-card na-card-tier");
          card.appendChild(el("strong", "na-card-title", tier.name));
          card.appendChild(el("div", "na-price", kes(tier.amountKes)));
          var list = el("ul", "na-includes");
          tier.includes.forEach(function (item) {
            list.appendChild(el("li", null, item));
          });
          card.appendChild(list);
          var btn = el("button", "na-btn na-btn-primary", "Register — " + kes(tier.amountKes));
          btn.type = "button";
          btn.addEventListener("click", function () {
            openCheckout(tier);
          });
          card.appendChild(btn);
          grid.appendChild(card);
        });
        wrap.appendChild(grid);
      })
      .catch(function (err) {
        status.textContent = "Packages temporarily unavailable. " + err.message;
      });
  }

  function openCheckout(tier) {
    var overlay = el("div", "na-overlay");
    var modal = el("div", "na-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    var close = el("button", "na-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", function () {
      overlay.remove();
    });
    modal.appendChild(close);

    modal.appendChild(el("h3", "na-title", tier.name));
    modal.appendChild(el("p", "na-sub", kes(tier.amountKes) + " — one-time, for the pre-season selection phase."));

    var form = el("form", "na-form");
    var fields = [
      { name: "guardianName", label: "Parent / guardian full name", type: "text", required: true },
      { name: "guardianEmail", label: "Email", type: "email", required: true },
      { name: "guardianPhone", label: "M-Pesa number", type: "tel", required: true, hint: "07XX XXX XXX — the STK prompt goes to this number" },
      { name: "athleteName", label: "Athlete full name", type: "text", required: true },
      { name: "athleteAge", label: "Athlete age", type: "number", required: true },
    ];
    var inputs = {};
    fields.forEach(function (f) {
      var label = el("label", "na-label");
      label.appendChild(el("span", "na-label-text", f.label));
      var input = el("input", "na-input");
      input.type = f.type;
      input.name = f.name;
      if (f.required) input.required = true;
      if (f.type === "tel") input.inputMode = "tel";
      if (f.type === "number") {
        input.min = "4";
        input.max = "60";
      }
      label.appendChild(input);
      if (f.hint) label.appendChild(el("span", "na-hint", f.hint));
      inputs[f.name] = input;
      form.appendChild(label);
    });

    var confLabel = el("label", "na-label");
    confLabel.appendChild(el("span", "na-label-text", "Home conference"));
    var conf = el("select", "na-input");
    var blank = el("option", null, "Seed me by home territory");
    blank.value = "";
    conf.appendChild(blank);
    DIVISIONS.forEach(function (d) {
      var opt = el("option", null, d);
      opt.value = d;
      conf.appendChild(opt);
    });
    confLabel.appendChild(conf);
    confLabel.appendChild(
      el("span", "na-hint", "Athletes are seeded into their home territory; this is a preference, not a placement."),
    );
    form.appendChild(confLabel);

    // Media consent — an explicit, required election. The paper
    // agreement makes this a "check one" and it must never default.
    var consentWrap = el("fieldset", "na-fieldset");
    consentWrap.appendChild(el("legend", "na-label-text", "Media release (required)"));
    [
      ["GRANTS", "GRANTS — name, image and video may be used in NRHL and Athlytica marketing"],
      ["DENIES", "DENIES — performance analysis only, no marketing use"],
    ].forEach(function (pair) {
      var row = el("label", "na-radio");
      var radio = el("input");
      radio.type = "radio";
      radio.name = "consentMedia";
      radio.value = pair[0];
      radio.required = true;
      row.appendChild(radio);
      row.appendChild(el("span", null, pair[1]));
      consentWrap.appendChild(row);
    });
    form.appendChild(consentWrap);

    var medical = el("label", "na-radio");
    var medicalBox = el("input");
    medicalBox.type = "checkbox";
    medicalBox.required = true;
    medical.appendChild(medicalBox);
    medical.appendChild(
      el(
        "span",
        null,
        "I affirm the athlete has no undisclosed medical condition that would contraindicate high-intensity athletic activity, and I accept the liability release.",
      ),
    );
    form.appendChild(medical);

    var submit = el("button", "na-btn na-btn-primary", "Send M-Pesa prompt — " + kes(tier.amountKes));
    submit.type = "submit";
    form.appendChild(submit);

    var result = el("div", "na-result");
    form.appendChild(result);
    modal.appendChild(form);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      result.innerHTML = "";

      var e164 = toE164(inputs.guardianPhone.value);
      if (!e164) {
        result.appendChild(
          el("p", "na-bad", "Enter a Kenyan mobile number — 07XXXXXXXX, 01XXXXXXXX or +2547XXXXXXXX."),
        );
        return;
      }
      var consent = form.querySelector('input[name="consentMedia"]:checked');
      if (!consent) {
        result.appendChild(el("p", "na-bad", "Choose a media release option."));
        return;
      }

      submit.disabled = true;
      result.appendChild(el("p", "na-status", "Sending the M-Pesa prompt to " + e164 + "…"));

      // Amount is echoed for display only — Athlytica HQ prices the tier
      // server-side and verifies this value. A tampered amount changes
      // nothing about what gets charged.
      fetch(API + "/biz/stk-push", {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: tier.id,
          amount: tier.amountKes,
          phoneNumber: e164,
          athleteName: inputs.athleteName.value.trim(),
          parentName: inputs.guardianName.value.trim(),
          parentEmail: inputs.guardianEmail.value.trim().toLowerCase(),
          athleteAge: Number(inputs.athleteAge.value),
          preferredCampus: conf.value || undefined,
          source: "nrhl",
        }),
      })
        .then(function (r) {
          return r.json().then(function (body) {
            return { ok: r.ok, body: body };
          });
        })
        .then(function (res) {
          result.innerHTML = "";
          submit.disabled = false;
          if (!res.ok || res.body.success === false) {
            result.appendChild(
              el("p", "na-bad", res.body.error || "We could not start the payment. Please try again."),
            );
            return;
          }
          var ref = res.body.accountReference || res.body.reference;
          result.appendChild(
            el("p", "na-good", "Check your phone — approve the M-Pesa prompt to complete registration."),
          );
          if (ref) {
            result.appendChild(
              el(
                "p",
                "na-note",
                "Your registration reference is " +
                  ref +
                  ". If the prompt does not arrive, pay via Lipa na M-Pesa → Paybill 4325935 and enter " +
                  ref +
                  " as the account number.",
              ),
            );
          }
          result.appendChild(
            el(
              "p",
              "na-note",
              "Your athlete code and Performance ID are issued once payment settles and the baseline combine session is complete.",
            ),
          );
        })
        .catch(function () {
          result.innerHTML = "";
          submit.disabled = false;
          result.appendChild(
            el("p", "na-bad", "Network error. Please try again, or pay via Paybill 4325935."),
          );
        });
    });

    overlay.appendChild(modal);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    inputs.guardianName.focus();
  }

  // ------------------------------------------------- legacy copy repair

  /**
   * The shipped bundle hardcodes a 4 May 2026 countdown that expired and
   * now renders the permanent string "Open" against a window that closed.
   * Repoint it at the phase the league is actually in.
   */
  function repairCountdown() {
    var days = document.getElementById("countdownDays");
    var label = document.getElementById("countdownLabel");
    if (!days || !label) return;

    var draft = Date.parse("2027-01-09T00:00:00+03:00");
    var remaining = Math.ceil((draft - Date.now()) / 86400000);
    if (remaining > 0) {
      days.textContent = String(remaining);
      label.textContent = "Days to the January 2027 opening matchday";
    } else {
      days.textContent = "Live";
      label.textContent = "Season 1 is under way";
    }
  }

  function start() {
    renderPillars();
    renderTimeline();
    renderPackages();
    renderStandings();
    renderLeaderboard();
    renderVerify();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  // The countdown repair runs on `load`, deliberately. main.js writes the
  // dead 4 May 2026 value from its own DOMContentLoaded handler, and this
  // file is deferred — so it executes BEFORE that handler and would be
  // overwritten. `load` always fires last, so the correct value wins
  // whether or not main.js is still on the page.
  window.addEventListener("load", repairCountdown);
})();
