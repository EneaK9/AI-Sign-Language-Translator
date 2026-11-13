import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

# Website URL (Update if needed)
BASE_URL = "https://www.gjshsh.al/daktilim/"

# Folder to save downloaded files
SAVE_DIR = "sign-language-dataset/alphabet"
os.makedirs(SAVE_DIR, exist_ok=True)

# Function to download files
def download_file(url, folder):
    filename = os.path.join(folder, url.split("/")[-1])
    response = requests.get(url, stream=True)
    if response.status_code == 200:
        with open(filename, "wb") as file:
            for chunk in response.iter_content(1024):
                file.write(chunk)
        print(f"✅ Downloaded: {filename}")
    else:
        print(f"❌ Failed to download: {url}")

# Scrape the page for media files
def scrape_page(url):
    response = requests.get(url)
    if response.status_code != 200:
        print("❌ Failed to access website")
        return

    soup = BeautifulSoup(response.text, "html.parser")

    # Find all video/image elements (Update selectors as needed)
    media_elements = soup.find_all("video") + soup.find_all("img")

    for media in media_elements:
        media_url = media.get("src") or media.get("data-src")
        if media_url:
            full_url = urljoin(BASE_URL, media_url)
            download_file(full_url, SAVE_DIR)

# Run the scraper
scrape_page(BASE_URL)
