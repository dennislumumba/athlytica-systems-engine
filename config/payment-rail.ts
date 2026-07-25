// =====================================================================
// M-PESA PAYMENT RAIL CONSTANTS — G-W6-PAY (manual 04 §5)
//
// Single typed source of truth for the live collection rail. The
// Hercules onboarding view renders these values verbatim; route
// handlers use them for rail verification. Changing either value is a
// founder decision (04 §4.2(3)) — they are Safaricom-side identities,
// not config.
//
// RAIL HISTORY: launched on NCBA / M-Pesa Paybill 880100 (settlement
// account 1010539223); migrated 2026-07-25 by founder directive to the
// dedicated Safaricom Paybill below (Athlytica Technologies Limited).
// =====================================================================

/** M-Pesa Paybill (business number) registrants pay into. */
export const MPESA_PAYBILL = "4325935" as const;

/** Registered Paybill business name (shown on the STK prompt). */
export const MPESA_PAYBILL_NAME = "Athlytica Technologies Limited" as const;

/** Copy block for onboarding/checkout views (render verbatim). */
export const PAYMENT_RAIL_DISPLAY = {
  railName: "M-Pesa Paybill",
  paybill: MPESA_PAYBILL,
  businessName: MPESA_PAYBILL_NAME,
  instruction:
    `Pay via M-Pesa: Lipa na M-Pesa → Paybill → Business No. ${MPESA_PAYBILL} → ` +
    "Account No. = YOUR registration reference (shown on your registration receipt).",
} as const;
