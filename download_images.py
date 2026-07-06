import csv
import urllib.request
import os

def download_images():
    base_dir = r"d:\Users\Leandro\Downloads\mkt-ajuda-main"
    headers = {'User-Agent': 'Mozilla/5.0'}
    
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
            print(f"Skipping {filename}, not found.")
            continue
            
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            
            for row in reader:
                item_id = row['ID'].strip()
                if not item_id:
                    continue
                    
                folder = os.path.join(base_dir, 'images', f'{item_type}s')
                os.makedirs(folder, exist_ok=True)
                
                save_path = os.path.join(folder, f'{item_id}.png')
                if os.path.exists(save_path):
                    continue
                    
                url = f"https://www.mkttoolbox.com/assets/img/items/{item_type}/{item_id}.png"
                
                try:
                    req = urllib.request.Request(url, headers=headers)
                    with urllib.request.urlopen(req) as response, open(save_path, 'wb') as out_file:
                        data = response.read()
                        out_file.write(data)
                    total_downloaded += 1
                    print(f"Downloaded {item_id}.png")
                except Exception as e:
                    total_failed += 1
                    print(f"Failed to download {item_id}: {e}")

    print(f"Finished. Downloaded {total_downloaded} images. Failed {total_failed}.")

if __name__ == "__main__":
    download_images()
