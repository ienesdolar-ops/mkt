import csv
import urllib.request
import urllib.parse
import os
import json
import re

def clean_name(name):
    # Remove all non-alphanumeric characters for the Mariowiki format
    return re.sub(r'[^a-zA-Z0-9]', '', name)

def download_images():
    base_dir = r"d:\Users\Leandro\Downloads\mkt-ajuda-main"
    headers = {'User-Agent': 'MarioKartTourHelperBot/1.0 (contact@example.com)'}
    
    files_to_parse = [
        ("drivers_2023_excel.csv", "driver"),
        ("karts_2023_excel.csv", "kart"),
        ("gliders_2023_excel.csv", "glider")
    ]
    
    total_downloaded = 0
    total_failed = 0
    
    for filename, item_type in files_to_parse:
        filepath = os.path.join(base_dir, filename)
        if not os.path.exists(filepath):
            continue
            
        items = []
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                item_id = row['ID'].strip()
                name = row['Name'].strip()
                if item_id:
                    items.append((item_id, name))
                    
        folder = os.path.join(base_dir, 'images', f'{item_type}s')
        os.makedirs(folder, exist_ok=True)
        
        # Batch into 50s for Mariowiki API
        batch_size = 50
        for i in range(0, len(items), batch_size):
            batch = items[i:i+batch_size]
            
            # Prepare API request
            titles_map = {} # title -> item_id
            titles_str = []
            for item_id, name in batch:
                save_path = os.path.join(folder, f'{item_id}.png')
                if os.path.exists(save_path):
                    try:
                        with open(save_path, 'rb') as check_f:
                            if check_f.read(4) == b'\x89PNG':
                                continue
                    except Exception:
                        pass
                
                clean = clean_name(name)
                title = f"File:MKT_Icon_{clean}.png"
                titles_map[title] = (item_id, save_path)
                titles_str.append(title)
                
            if not titles_str:
                continue
                
            api_url = "https://www.mariowiki.com/api.php?action=query&prop=imageinfo&iiprop=url&format=json&titles=" + urllib.parse.quote("|".join(titles_str))
            
            try:
                req = urllib.request.Request(api_url, headers=headers)
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read())
                    pages = data['query']['pages']
                    
                    for page_id, page_data in pages.items():
                        title = page_data.get('title', '')
                        # Mariowiki normalizes underscores to spaces
                        title_with_underscores = title.replace(' ', '_')
                        
                        if title_with_underscores in titles_map:
                            item_id, save_path = titles_map[title_with_underscores]
                            if 'imageinfo' in page_data:
                                img_url = page_data['imageinfo'][0]['url']
                                # Download the image
                                try:
                                    img_req = urllib.request.Request(img_url, headers=headers)
                                    with urllib.request.urlopen(img_req) as img_resp, open(save_path, 'wb') as out_f:
                                        out_f.write(img_resp.read())
                                    total_downloaded += 1
                                except Exception as e:
                                    total_failed += 1
                            else:
                                total_failed += 1
                        else:
                            total_failed += 1
            except Exception as e:
                print(f"API request failed: {e}")
                
    print(f"Finished. Downloaded {total_downloaded}. Failed {total_failed}.")

if __name__ == "__main__":
    download_images()
