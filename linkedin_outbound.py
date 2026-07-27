import os
import json
import time
import random
from datetime import datetime
from playwright.sync_api import sync_playwright

PIPELINE_VERSION = "8.0 (Lead Harvesting + Custom Copy Generator)"
TARGET_SEARCH_URL = "https://www.linkedin.com/search/results/people/?keywords=Marketing%20Director%20OR%20Brand%20Manager&locationByGeoUrn=%5B%22100732083%22%5D&network=%5B%22S%22%2C%22O%22%5D&origin=FACETED_SEARCH"
OUTPUT_FILE = "review_drafts.json"

def generate_personalized_pitch(name, headline):
    """Architects a high-ticket B2B tournament block sponsorship proposal."""
    first_name = name.split()[0] if name else "Director"
    
    pitch = (
        f"Hi {first_name},\n\n"
        f"Noticed your focus on brand building as {headline}. We are launching the Nairobi Regional Hockey "
        f"League (NRHL) this August 2026, creating an elite ecosystem intersecting high-net-worth fan engagement "
        f"and programmatic digital sports activation.\n\n"
        f"Given the explosive 2026 growth in experiential sports marketing, we've designed exclusive corporate "
        f"tournament sponsorship blocks that deliver measurable consumer sentiment metrics and live venue visibility "
        f"right here in Nairobi. I'd love to share our short execution blueprint if you're open to exploring a "
        f"high-ROI partnership.\n\n"
        f"Best regards,\nDennis Lumumba\nFounder, Big Ice & Athlytica"
    )
    return pitch

def execute_outbound_pipeline():
    print(f"\n==================================================")
    print(f"🚀 INITIALIZING VENTURE ENGINE PIPELINE v{PIPELINE_VERSION}")
    print(f"==================================================\n")
    
    # Initialize or load existing review ledger file safely
    ledger_data = []
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                ledger_data = json.load(f)
        except:
            ledger_data = []

    with sync_playwright() as p:
        print("System Action: Launching Chromium with persistent state profile...")
        context = p.chromium.launch_persistent_context(
            "linkedin_profile",
            headless=False,
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        page = context.pages[0] if context.pages else context.new_page()
        print("System Action: Evaluating global authentication status...")
        page.goto("https://www.linkedin.com", wait_until="commit")
        time.sleep(3)

        while True:
            if "checkpoint" in page.url or "challenge" in page.url or "login" in page.url:
                print("\n🚨 SYSTEM BLOCK: Security Checkpoint Active. Solve it manually inside the UI window...")
                time.sleep(5)
            else:
                print("System Status: Active authenticated session verified.")
                break
        
        print(f"System Action: Routing browser to targeted corporate search directory...")
        try:
            page.goto(TARGET_SEARCH_URL, wait_until="load", timeout=45000)
        except Exception as e:
            print(f"Navigation warning (handled): {str(e)}")
        
        print("System Action: Allowing directory assets to render baseline tags...")
        time.sleep(6)
        
        # Scrape profile anchor signatures from layout interface
        raw_anchors = page.locator("a[href*='/in/']").all()
        profile_urls = []
        for anchor in raw_anchors:
            try:
                url = anchor.get_attribute("href")
                if url and "/in/" in url:
                    clean_url = url.split("?")[0].rstrip('/')
                    if clean_url not in profile_urls and "dennismukhavani" not in clean_url and "dennislumba268" not in clean_url:
                        profile_urls.append(clean_url)
            except:
                continue

        print(f"Target Discovery: Extracted {len(profile_urls)} unique enterprise profile vectors from search layout.")
        
        # Limit loop to top 5 profiles per diagnostic review run session
        for target_url in profile_urls[:5]:
            # Skip if this specific profile URL signature already exists in our review database
            if any(lead.get("profile_url") == target_url for lead in ledger_data):
                print(f"System Notice: Vector {target_url} already indexed in review matrix. Skipping.")
                continue

            profile_delay = random.uniform(15.0, 30.0)
            print(f"\n⏳ Throttling: Routing browser into profile asset in {profile_delay:.2f}s...")
            time.sleep(profile_delay)
            
            print(f"System Action: Extracting metadata values from inside profile: {target_url}")
            try:
                page.goto(target_url, wait_until="load", timeout=45000)
                
                # Dynamic Guardrail: Wait explicitly for the profile name heading card to render text
                page.wait_for_selector("h1.text-heading-xlarge", timeout=10000)
                time.sleep(2)
                
                # Upgraded Precision Selectors matching modern LinkedIn layouts
                name_element = page.locator("h1.text-heading-xlarge").first
                lead_name = name_element.inner_text().strip() if name_element.is_visible() else "Enterprise Lead"
                
                headline_element = page.locator(".text-body-medium").first
                lead_headline = headline_element.inner_text().strip() if headline_element.is_visible() else "Corporate Marketing Leader"
                
                print(f"  --> Metadata Captured: Name='{lead_name}' | Title='{lead_headline}'")
                
            except Exception as e:
                print(f"Anomaly encountered extracting profile matrix: {str(e)}")
                continue
                
        print("\nSystem Action: Saving structural session state files and shutting down browser...")
        context.close()
        print(f"==================================================")
        print(f"🏁 PIPELINE RUN COMPLETE | Total Review Drafts Now Available: {len(ledger_data)}")
        print(f"==================================================\n")

if __name__ == "__main__":
    execute_outbound_pipeline()