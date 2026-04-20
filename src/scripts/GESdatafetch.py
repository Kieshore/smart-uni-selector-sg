import requests

dataset_id = "d_3c55210de27fcccda2ed0c63fdd2b352"
url = f"https://data.gov.sg/api/action/datastore_search?resource_id={dataset_id}"

headers = {
    "x-api-key": "v2:0098f3f37e3b4389f615d56a568a1c0385fce9de8dd6879d4275371e1dd82ae1:Hx8oRg1CEX-_zhfy3X97VtHDqoozPUnS"
}

response = requests.get(url, headers=headers, timeout=30)
print(response.status_code)
print(response.json())