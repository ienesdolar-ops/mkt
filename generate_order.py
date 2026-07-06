import re
import json

def generate():
    with open('raw_order.txt', 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    order_map = {}
    current_idx = 0
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith('Name\t') or line.startswith('ordem de'):
            continue
            
        # The name is the first part before the first tab
        # Actually some lines have Name[tab]Got... let's just split by tab
        parts = line.split('\t')
        name = parts[0].strip()
        
        # If it's empty, it might have been leading tabs in the line.split
        # Let's try splitting by multiple tabs or spaces?
        # Actually, if we look at the raw text: "\tBaby Mario\t\t\t\t3"
        # strip() will remove leading tabs. So line.split('\t') will have "Baby Mario" at index 0.
        
        if name and name != 'Name':
            name = name.replace("\\'", "'")
            order_map[name] = current_idx
            current_idx += 1
            
    with open('order.js', 'w', encoding='utf-8') as f:
        f.write('window.gameOrder = ' + json.dumps(order_map, indent=4) + ';\n')
        
if __name__ == '__main__':
    generate()
