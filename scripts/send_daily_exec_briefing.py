#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime
from urllib import error, request


def build_payload() -> dict:
    return {
        "text": "🚨 **DAILY EXECUTIVE BRIEFING | DENNIS LUMUMBA**",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"Venture Engine Briefing — {datetime.now().strftime('%Y-%m-%d')}",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*🎯 THE ONE THING TODAY:*\n> Execute the 10,550 KES J&M Bank payment to kill compounding interest drag and preserve NCBA transactional rail scores. Market confrontation overrides product setup.",
                },
            },
            {"type": "divider"},
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*💼 CORE VENTURE SYSTEM MATRIX:*\n• *Athlytica:* Data infrastructure viability verified against 2026 global shifts ($7B+ market tracking). Focus exclusively on scouting passport schema deployment.\n• *NRHL:* August 2026 launch logistics mapped. Target corporate sponsorship acquisition using NCBA accounts.",
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*⚠️ SYSTEM LIABILITIES & GUARDRAILS:*\n• *Master Debt:* 700,000 KES outstanding anchor. Requires an immediate 3x multiplication of the 48,500 KES margin.\n• *Biological Health:* Personal molar extraction (~20,000 KES) and Hanan's medical checkup are flagged as uncompleted priorities.",
                },
            },
        ],
    }


def send_payload(payload: dict) -> None:
    webhook_url = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook_url:
        raise RuntimeError("SLACK_WEBHOOK_URL is not set")

    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                print("System Status: Push alert deployed to Slack successfully.")
            else:
                print(f"Execution Error: Server returned status code {response.status}")
                sys.exit(1)
    except error.HTTPError as exc:
        print(f"Execution Error: Server returned status code {exc.code}")
        sys.exit(1)
    except error.URLError as exc:
        print(f"Critical Pipeline Failure: {exc.reason}")
        sys.exit(1)


if __name__ == "__main__":
    try:
        send_payload(build_payload())
    except RuntimeError as exc:
        print(f"Critical Pipeline Failure: {exc}")
        sys.exit(1)
