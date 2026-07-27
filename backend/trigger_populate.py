import requests

if __name__ == "__main__":
    response = requests.post(
        "http://localhost:8000/graphql",
        json={"query": "mutation { populateCompaniesData }"}
    )
    print(response.json())
