import requests
import csv
from io import StringIO
url = 'https://www.nseindia.com/api/event-calendar?index=equities&csv=true'
h = {'User-Agent': 'Mozilla/5.0'}
s = requests.Session()
s.get('https://www.nseindia.com', headers=h, timeout=5)
r = s.get(url, headers=h, timeout=5)
csv_data = r.text.replace('\ufeff', '')
csv_data = csv_data.replace(' \r\n', '').replace(' \n', '').replace('\r\n"', '"').replace('\n"', '"')
reader = csv.reader(StringIO(csv_data))
for i, row in enumerate(reader):
    print(row)
    if i > 2: break
