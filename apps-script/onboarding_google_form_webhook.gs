/**
 * Big Ice onboarding webhook sender.
 * Signs each Google Form submission and POSTs it to
 * app/api/v1/onboarding/google-forms/route.ts.
 *
 * SETUP (one-time, in the Apps Script editor bound to the Form):
 *   1. Project Settings > Script Properties > add:
 *        ONBOARDING_WEBHOOK_URL      = https://<your-deployment>/api/v1/onboarding/google-forms
 *        ONBOARDING_WEBHOOK_SECRET   = <same value as GOOGLE_FORMS_WEBHOOK_SECRET in .env>
 *      (Do not hardcode the secret in this file — Script Properties keeps it
 *      out of source and out of any copy/paste or version history.)
 *   2. Run createOnFormSubmitTrigger() once (select it in the function
 *      dropdown, click Run) to install the installable form-submit trigger.
 *   3. Edit the QUESTION_TITLES map below to match your form's exact
 *      question titles, and TRACK_TYPE_LABELS / SEX_LABELS if your form
 *      uses human-readable option labels instead of raw enum values.
 */

// Placeholder question titles — replace each right-hand string with the
// exact title of the matching question in your form.
const QUESTION_TITLES = {
  legalName: "Legal Name",
  dateOfBirth: "Date of Birth",
  sexAtBirth: "Sex at Birth",
  nationalities: "Nationality (ISO-3 codes, comma separated)",
  primarySportCode: "Primary Sport",
  selectedTierName: "Selected Package",
  trackType: "Training Track",
  cohortLabel: "Cohort",
  sessionSlot: "Session Slot",
  sessionDayOfWeek: "Session Day of Week (0=Sun..6=Sat)",
  windowStartTime: "Session Start Time",
  windowEndTime: "Session End Time",
  capacity: "Cohort Capacity",
  seasonStartDate: "Season Start Date",
  seasonEndDate: "Season End Date",
};

// Map human-readable form option labels to the enum values the route expects.
// Add/edit entries to match the exact option text used in your form.
const TRACK_TYPE_LABELS = {
  "Basic Skating": "basic_skating",
  "Figure Skating Precision": "figure_skating_precision",
};

const SEX_LABELS = {
  Male: "male",
  Female: "female",
  Intersex: "intersex",
  "Prefer not to say": "undisclosed",
};

function onFormSubmitTrigger(e) {
  try {
    const response = e.response;
    const answers = {};
    response.getItemResponses().forEach(function (itemResponse) {
      answers[itemResponse.getItem().getTitle()] = itemResponse.getResponse();
    });

    const payload = buildPayload_(response.getId(), answers);
    sendToOnboardingWebhook_(payload);
  } catch (err) {
    console.error("onFormSubmitTrigger failed: " + err + "\n" + (err && err.stack));
    throw err; // preserves Apps Script's built-in trigger-failure email to the project owner
  }
}

function buildPayload_(formResponseId, answers) {
  const get = function (key) {
    const title = QUESTION_TITLES[key];
    return title !== undefined ? answers[title] : undefined;
  };

  const nationalitiesRaw = get("nationalities");
  const nationalities = nationalitiesRaw
    ? nationalitiesRaw
        .split(",")
        .map(function (s) {
          return s.trim().toUpperCase();
        })
        .filter(function (s) {
          return s.length === 3;
        })
    : undefined;

  const payload = {
    formResponseId: formResponseId,
    athlete: {
      legalName: (get("legalName") || "").trim(),
      dateOfBirth: normalizeDate_(get("dateOfBirth")),
      sexAtBirth: SEX_LABELS[get("sexAtBirth")] || undefined,
      nationalities: nationalities,
      primarySportCode: (get("primarySportCode") || "ice_hockey").trim(),
    },
    enrollment: {
      selectedTierName: (get("selectedTierName") || "").trim(),
      trackType: TRACK_TYPE_LABELS[get("trackType")] || get("trackType"),
      cohortLabel: (get("cohortLabel") || "").trim(),
      sessionSlot: parseInt(get("sessionSlot"), 10),
      sessionDayOfWeek: parseInt(get("sessionDayOfWeek"), 10),
      windowStartTime: normalizeTime_(get("windowStartTime")),
      windowEndTime: normalizeTime_(get("windowEndTime")),
      capacity: parseInt(get("capacity"), 10),
      seasonStartDate: normalizeDate_(get("seasonStartDate")),
      seasonEndDate: normalizeDate_(get("seasonEndDate")),
    },
  };

  return payload;
}

// Apps Script DATE-type items already return "YYYY-MM-DD"; this only
// reformats if a free-text answer came through in a different shape.
function normalizeDate_(value) {
  if (!value) return value;
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return trimmed;
  return Utilities.formatDate(parsed, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function normalizeTime_(value) {
  if (!value) return value;
  const trimmed = String(value).trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed + ":00" : trimmed;
}

function sendToOnboardingWebhook_(payload) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty("ONBOARDING_WEBHOOK_URL");
  const secret = props.getProperty("ONBOARDING_WEBHOOK_SECRET");

  if (!url || !secret) {
    throw new Error("ONBOARDING_WEBHOOK_URL / ONBOARDING_WEBHOOK_SECRET script properties are not set");
  }

  const body = JSON.stringify(payload);
  const signature = toHex_(Utilities.computeHmacSha256Signature(body, secret));

  const options = {
    method: "post",
    contentType: "application/json",
    payload: body,
    headers: { "X-Signature": signature },
    muteHttpExceptions: true,
  };

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const httpResponse = UrlFetchApp.fetch(url, options);
    const status = httpResponse.getResponseCode();

    if (status >= 200 && status < 300) {
      console.log("onboarding webhook succeeded: formResponseId=" + payload.formResponseId + " status=" + status);
      return;
    }

    console.error(
      "onboarding webhook failed (attempt " + attempt + "/" + maxAttempts + "): " +
      "status=" + status + " body=" + httpResponse.getContentText()
    );

    // 4xx means the request itself is invalid (bad signature, bad payload,
    // unknown tier) — retrying identical input will not help.
    if (status >= 400 && status < 500) break;

    if (attempt < maxAttempts) Utilities.sleep(1000 * attempt);
  }

  throw new Error("onboarding webhook did not succeed after " + maxAttempts + " attempt(s) for formResponseId=" + payload.formResponseId);
}

function toHex_(bytes) {
  return bytes
    .map(function (b) {
      const v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? "0" + v : v;
    })
    .join("");
}

function createOnFormSubmitTrigger() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers()
    .filter(function (t) {
      return t.getHandlerFunction() === "onFormSubmitTrigger";
    })
    .forEach(function (t) {
      ScriptApp.deleteTrigger(t);
    });
  ScriptApp.newTrigger("onFormSubmitTrigger").forForm(form).onFormSubmit().create();
}
