import os
import json
import time
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("DATA_GOV_SG_API_KEY")
DATASET_ID = "d_3c55210de27fcccda2ed0c63fdd2b352"
BASE_URL = "https://data.gov.sg/api/action/datastore_search"

if not API_KEY:
    raise ValueError("DATA_GOV_SG_API_KEY not found in .env")

HEADERS = {
    "x-api-key": API_KEY
}


def to_float(value):
    if value is None:
        return None
    s = str(value).strip().lower()
    if s in ("", "na", "n.a.", "-", "null"):
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def normalize_university_name(name: str) -> str:
    mapping = {
        "National University of Singapore": "NUS",
        "Nanyang Technological University": "NTU",
        "Singapore Management University": "SMU",
        "Singapore Institute of Technology": "SIT",
        "Singapore University of Technology and Design": "SUTD",
        "Singapore University of Social Sciences": "SUSS",
    }
    return mapping.get(name.strip(), name.strip())


def fetch_all_rows():
    offset = 0
    limit = 100
    all_rows = []

    while True:
        params = {
            "resource_id": DATASET_ID,
            "limit": limit,
            "offset": offset,
        }

        response = requests.get(BASE_URL, params=params, headers=HEADERS, timeout=30)

        if response.status_code == 429:
            time.sleep(10)
            continue

        response.raise_for_status()
        payload = response.json()
        records = payload["result"]["records"]

        if not records:
            break

        for row in records:
            university = row.get("university")
            degree = row.get("degree")
            year = row.get("year")

            if not university or not degree or not year:
                continue

            all_rows.append({
                "university_name": normalize_university_name(university),
                "school": row.get("school"),
                "raw_course_name": degree,
                "basic_monthly_median": to_float(row.get("basic_monthly_median")),
                "employment_rate_overall": to_float(row.get("employment_rate_overall")),
                "employment_rate_ft_perm": to_float(row.get("employment_rate_ft_perm")),
                "career_prospects_score": None,
                "source_year": int(year),
                "source_type": "data.gov.sg GES API"
            })

        if len(records) < limit:
            break

        offset += limit
        time.sleep(1)

    return all_rows


def main():
    rows = fetch_all_rows()
    print(json.dumps(rows))


if __name__ == "__main__":
    main()