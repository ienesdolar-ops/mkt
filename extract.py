import re

def extract(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Try looking for item names inside table rows
    matches = re.findall(r'<td[^>]*class="td-name"[^>]*>([^<]+)</td>', html, re.IGNORECASE)
    if not matches:
        matches = re.findall(r'data-name="([^"]+)"', html)
    if not matches:
        matches = re.findall(r'class="item-name"[^>]*>([^<]+)<', html)
    
    print(f"File {filename}: {len(matches)} matches")
    if matches:
        print(matches[:10])

extract('drivers_mkt.html')
