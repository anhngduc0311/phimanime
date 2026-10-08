import requests
import re

s = requests.Session()
# Let's fetch the html of a watch page on anime47.best
watch_url = 'https://anime47.best/phim/toki-wo-kakeru-shoujo/m10406.html'
r = s.get(watch_url, headers={
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
})
print("Watch page status:", r.status_code)
print("Watch page HTML length:", len(r.text))
print("Cookies:", s.cookies.get_dict())

# Let's check how anime47.best frontend fetches data
# Let's inspect scripts or see if anime47 has any public player endpoints
