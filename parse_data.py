import csv
import json
import re
import os

def parse_csv(filepath, item_type):
    items = []
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return items
        
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            item_id = row['ID']
            name = row['Name']
            rarity = row['Rarity']
            tracks_raw = row['Top Shelf Courses']
            
            tracks = []
            if tracks_raw:
                # Split by comma followed by a space or just comma
                # Example: "Athens Dash 2, Athens Dash 3T, RMX Mario Circuit 1 (Lvl 3)"
                track_list = [t.strip() for t in tracks_raw.split(',') if t.strip()]
                for track_str in track_list:
                    # Match (Lvl X)
                    match = re.search(r'\(Lvl (\d+)\)$', track_str)
                    if match:
                        unlock_level = int(match.group(1))
                        # Remove the (Lvl X) part from the track name
                        track_name = re.sub(r'\s*\(Lvl \d+\)$', '', track_str).strip()
                    else:
                        unlock_level = 1
                        track_name = track_str
                        
                    tracks.append({
                        "name": track_name,
                        "unlockLevel": unlock_level
                    })
                    
            items.append({
                "id": item_id,
                "name": name,
                "type": item_type,
                "rarity": rarity,
                "tracks": tracks
            })
    return items

def main():
    base_dir = r"C:\Users\Usuario\.gemini\antigravity\scratch\mkt-facilitator"
    
    drivers = parse_csv(os.path.join(base_dir, "drivers_2023_excel.csv"), "driver")
    karts = parse_csv(os.path.join(base_dir, "karts_2023_excel.csv"), "kart")
    gliders = parse_csv(os.path.join(base_dir, "gliders_2023_excel.csv"), "glider")
    
    all_items = drivers + karts + gliders
    
    # Calculate all unique tracks
    all_tracks = set()
    for item in all_items:
        for t in item['tracks']:
            all_tracks.add(t['name'])
            
    output_data = {
        "items": all_items,
        "allTracks": sorted(list(all_tracks))
    }
    
    js_content = f"const MKT_DATABASE = {json.dumps(output_data, indent=2, ensure_ascii=False)};"
    
    with open(os.path.join(base_dir, "database.js"), 'w', encoding='utf-8') as f:
        f.write(js_content)
        
    print(f"Parsed {len(all_items)} total items. Saved to database.js")

if __name__ == "__main__":
    main()
