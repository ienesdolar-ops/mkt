// Parser for CSV Data
function parseCSV(rawObj, type) {
    const rawCsv = typeof rawObj === 'string' ? rawObj : (rawObj.value || '');
    const items = [];
    const lines = rawCsv.split('\n');
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(';');
        if (parts.length < 4) continue;
        const id = parts[0].trim();
        const name = parts[1].trim();
        const rarity = parts[2].trim();
        const tracksRaw = parts[3].trim();
        
        const tracks = [];
        if (tracksRaw) {
            const trackList = tracksRaw.split(',').map(t => t.trim()).filter(t => t);
            trackList.forEach(tStr => {
                let trackName = tStr;
                let unlockLevel = 1;
                const match = tStr.match(/\(Lvl (\d+)\)$/);
                if (match) {
                    unlockLevel = parseInt(match[1]);
                    trackName = tStr.replace(/\s*\(Lvl \d+\)$/, '').trim();
                }
                tracks.push({ name: trackName, unlockLevel });
            });
        }
        items.push({ id, name, type, rarity, tracks, order: (typeof window !== 'undefined' && window.gameOrder && window.gameOrder[name] !== undefined) ? window.gameOrder[name] : i + 9999 });
    }
    return items;
}

const DEFAULT_DB = {
    items: [
        ...parseCSV(RAW_DRIVERS, 'driver'),
        ...parseCSV(RAW_KARTS, 'kart'),
        ...parseCSV(RAW_GLIDERS, 'glider')
    ],
    allTracks: new Set()
};

DEFAULT_DB.items.forEach(item => {
    item.tracks.forEach(t => DEFAULT_DB.allTracks.add(t.name));
});

// App State
let db = {
    items: DEFAULT_DB.items,
    allTracks: DEFAULT_DB.allTracks,
    inventory: [] // array of { id: string, level: number }
};

let currentProfile = null;
let profiles = [];

// Elements
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Profile & Data Management
function loadProfiles() {
    profiles = JSON.parse(localStorage.getItem('mkt-profiles') || '[]');
    currentProfile = localStorage.getItem('mkt-current-profile');
    
    if (currentProfile && profiles.includes(currentProfile)) {
        document.getElementById('login-modal').classList.remove('active');
        document.getElementById('user-info').style.display = 'block';
        document.getElementById('current-user-name').textContent = currentProfile;
        loadDataForProfile(currentProfile);
    } else {
        renderProfileModal();
    }
}

function renderProfileModal() {
    const list = document.getElementById('profile-list');
    list.innerHTML = '';
    profiles.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'profile-btn';
        btn.textContent = p;
        btn.onclick = () => selectProfile(p);
        list.appendChild(btn);
    });
}

document.getElementById('btn-create-profile').onclick = () => {
    const name = document.getElementById('new-profile-name').value.trim();
    if (name && !profiles.includes(name)) {
        profiles.push(name);
        localStorage.setItem('mkt-profiles', JSON.stringify(profiles));
        selectProfile(name);
    }
};

document.getElementById('btn-logout').onclick = () => {
    document.getElementById('login-modal').classList.add('active');
    document.getElementById('user-info').style.display = 'none';
    renderProfileModal();
};

function selectProfile(name) {
    currentProfile = name;
    localStorage.setItem('mkt-current-profile', name);
    document.getElementById('login-modal').classList.remove('active');
    document.getElementById('user-info').style.display = 'block';
    document.getElementById('current-user-name').textContent = name;
    loadDataForProfile(name);
}

function loadDataForProfile(name) {
    const saved = localStorage.getItem('mkt-data-v2-' + name);
    if (saved) {
        const parsed = JSON.parse(saved);
        db.inventory = parsed.inventory || [];
        // Migrate old flat arrays if any
        db.inventory = db.inventory.map(inv => typeof inv === 'string' ? { id: inv, level: 1 } : inv);
    } else {
        // Fallback: check if they had a global profile before we added profiles
        const legacy = localStorage.getItem('mkt-data-v2');
        if (legacy && profiles.length === 1) {
            db.inventory = JSON.parse(legacy).inventory || [];
            localStorage.removeItem('mkt-data-v2'); // migrated
        } else {
            db.inventory = [];
        }
    }
    
    // Refresh UI
    renderInventory();
    renderRecommendations();
    renderRanking();
}

function saveData() {
    if (!currentProfile) return;
    localStorage.setItem('mkt-data-v2-' + currentProfile, JSON.stringify({
        inventory: db.inventory
    }));
}

// Tab Switching
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');

        if(tab.dataset.target === 'tab-inventory') renderInventory();
        if(tab.dataset.target === 'tab-recommendations') renderRecommendations();
        if(tab.dataset.target === 'tab-ranking') renderRanking();
        if(tab.dataset.target === 'tab-calculators') initCalculators();
    });
});

// Calculators & Tracks Logic
let calculatorsInit = false;
function initCalculators() {
    if (calculatorsInit) return;
    
    // Populate tracks datalist
    const datalist = document.getElementById('track-datalist');
    const sortedTracks = Array.from(db.allTracks).sort();
    sortedTracks.forEach(track => {
        const option = document.createElement('option');
        option.value = track;
        datalist.appendChild(option);
    });
    
    const trackInput = document.getElementById('track-search-input');
    trackInput.addEventListener('change', (e) => renderTrackResults(e.target.value));
    
    calculatorsInit = true;
}

function renderTrackResults(trackName) {
    if (!db.allTracks.has(trackName)) {
        document.getElementById('track-results').style.display = 'none';
        return;
    }
    
    document.getElementById('track-results').style.display = 'block';
    
    ['driver', 'kart', 'glider'].forEach(type => {
        const ul = document.getElementById(`track-${type}-list`);
        ul.innerHTML = '';
        
        // Find items that cover this track
        const coveringItems = db.items.filter(i => i.type === type && i.tracks.some(t => t.name === trackName));
        
        if (coveringItems.length === 0) {
            ul.innerHTML = '<li>Nenhum item cobre esta pista.</li>';
            return;
        }
        
        // Sort: Owned (level descending) then Unowned
        coveringItems.sort((a, b) => {
            const invA = db.inventory.find(i => i.id === a.id);
            const invB = db.inventory.find(i => i.id === b.id);
            
            if (invA && invB) return invB.level - invA.level;
            if (invA && !invB) return -1;
            if (!invA && invB) return 1;
            return a.name.localeCompare(b.name);
        });
        
        coveringItems.forEach(item => {
            const invEntry = db.inventory.find(inv => inv.id === item.id);
            const trackUnlock = item.tracks.find(t => t.name === trackName).unlockLevel;
            
            let statusHtml = '';
            if (invEntry) {
                if (invEntry.level >= trackUnlock) {
                    statusHtml = `<span style="color: green; font-weight: bold;">Possui (Lvl ${invEntry.level})</span>`;
                } else {
                    statusHtml = `<span style="color: orange; font-weight: bold;">Possui (Lvl ${invEntry.level} - Requer Lvl ${trackUnlock})</span>`;
                }
            } else {
                statusHtml = `<span style="color: red;">Não possui (Requer Lvl ${trackUnlock})</span>`;
            }
            
            const li = document.createElement('li');
            li.className = 'rec-item';
            li.innerHTML = `
                <div class="rec-header" style="justify-content: flex-start; gap: 10px;">
                    ${getItemImageHtml(item)}
                    <div>
                        <span class="rec-name" style="display:block;">${item.name} <span class="item-rarity-badge rarity-${item.rarity}" style="font-size:0.7rem;">${item.rarity}</span></span>
                        <div style="margin-top: 4px; font-size: 0.85rem;">${statusHtml}</div>
                    </div>
                </div>
            `;
            ul.appendChild(li);
        });
    });
}

window.runTicketOptimizer = function() {
    const tickets = {
        HighEnd: parseInt(document.getElementById('opt-tickets-he').value) || 0,
        Super: parseInt(document.getElementById('opt-tickets-super').value) || 0,
        Normal: parseInt(document.getElementById('opt-tickets-normal').value) || 0
    };
    
    if (tickets.HighEnd === 0 && tickets.Super === 0 && tickets.Normal === 0) {
        alert('Insira pelo menos 1 bilhete para otimizar.');
        return;
    }
    
    const resultsContainer = document.getElementById('optimizer-results');
    const resultsList = document.getElementById('opt-results-list');
    resultsContainer.style.display = 'block';
    resultsList.innerHTML = '<li>Calculando... (pode demorar um pouco)</li>';
    
    // Use setTimeout to allow UI to render the "calculating" message
    setTimeout(() => {
        const recommendations = [];
        const virtualInventory = JSON.parse(JSON.stringify(db.inventory));
        
        // Helper to get virtual coverage
        const getVirtualCoverage = () => {
            const covered = new Set();
            virtualInventory.forEach(inv => {
                const item = db.items.find(i => i.id === inv.id);
                if (item) {
                    item.tracks.forEach(t => {
                        if (t.unlockLevel <= inv.level) covered.add(t.name);
                    });
                }
            });
            return covered;
        };
        
        let initialCoverage = getVirtualCoverage();
        
        // Greedy algorithm: for each ticket type, find the upgrade that yields max new tracks
        ['HighEnd', 'Super', 'Normal'].forEach(rarity => {
            let tCount = tickets[rarity];
            while (tCount > 0) {
                let bestGain = -1;
                let bestItem = null;
                let bestNewTracks = [];
                
                // Only consider items we own of this rarity that are below level 8
                const candidates = db.items.filter(i => i.rarity === rarity);
                const ownedCandidates = candidates.filter(c => virtualInventory.some(inv => inv.id === c.id && inv.level < 8));
                
                ownedCandidates.forEach(item => {
                    const invEntry = virtualInventory.find(inv => inv.id === item.id);
                    const nextLevel = invEntry.level + 1;
                    
                    // What new tracks does nextLevel give?
                    const unlockedHere = item.tracks.filter(t => t.unlockLevel === nextLevel);
                    if (unlockedHere.length > 0) {
                        const newCoverage = unlockedHere.filter(t => !initialCoverage.has(t.name));
                        if (newCoverage.length > bestGain) {
                            bestGain = newCoverage.length;
                            bestItem = item;
                            bestNewTracks = newCoverage.map(t => t.name);
                        }
                    } else {
                        // Even if 0 new tracks, maybe giving a ticket makes it closer to next unlock?
                        // For a simple greedy approach, we prioritize immediate new tracks.
                    }
                });
                
                if (bestGain > 0 && bestItem) {
                    // Apply upgrade virtually
                    const invEntry = virtualInventory.find(inv => inv.id === bestItem.id);
                    invEntry.level++;
                    initialCoverage = getVirtualCoverage(); // update coverage
                    
                    recommendations.push({
                        item: bestItem,
                        from: invEntry.level - 1,
                        to: invEntry.level,
                        newTracks: bestNewTracks
                    });
                } else {
                    // No single ticket gives an immediate new track. 
                    // This is a limitation of a greedy algorithm. 
                    // We could simulate 2 tickets at once, but for performance we break.
                    break; 
                }
                tCount--;
            }
        });
        
        resultsList.innerHTML = '';
        if (recommendations.length === 0) {
            resultsList.innerHTML = '<li>Nenhum upgrade imediato com +1 nível resultaria em pistas novas. (Você pode precisar de mais de 1 bilhete no mesmo item para chegar ao Nível 3, 6 ou 8).</li>';
        } else {
            recommendations.forEach(rec => {
                const li = document.createElement('li');
                li.className = 'rec-item';
                li.innerHTML = `
                    <div class="rec-header" style="justify-content: flex-start; gap: 10px;">
                        ${getItemImageHtml(rec.item)}
                        <div style="flex: 1;">
                            <span class="rec-name">${rec.item.name}</span>
                            <span style="font-size: 0.9rem; margin-left: 10px;">Lvl ${rec.from} ➔ <strong>Lvl ${rec.to}</strong></span>
                        </div>
                        <span class="rec-badge" style="background: #2d8a64;">+${rec.newTracks.length} Pistas</span>
                    </div>
                    <div class="rec-tracks" style="margin-top: 10px;">
                        <strong>Desbloqueios:</strong> ${rec.newTracks.join(', ')}
                    </div>
                `;
                resultsList.appendChild(li);
            });
        }
    }, 100);
};

// Item Search (DB Tab)
const dbSearch = document.getElementById('db-search');
if (dbSearch) {
    dbSearch.addEventListener('input', () => {
        renderDBItems(document.querySelector('.filters .active').dataset.filter);
    });
}

// Image Helper
function getItemImageHtml(item) {
    const typeFolder = item.type + 's';
    const fallbackText = item.name.substring(0, 2).toUpperCase();
    // Assuming local images will match the ID (e.g. d_mario.png)
    return `<div class="item-image ${item.rarity}" title="${item.name}">
        <img src="images/${typeFolder}/${item.id}.png" alt="${fallbackText}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.parentElement.textContent='${fallbackText}';">
    </div>`;
}

// DB Rendering
function renderDBItems(filter = 'all') {
    const list = document.getElementById('db-items-list');
    list.innerHTML = '';
    
    let filtered = filter === 'all' ? db.items : db.items.filter(i => i.type === filter);
    
    if (dbSearch && dbSearch.value.trim() !== '') {
        const query = dbSearch.value.trim().toLowerCase();
        filtered = filtered.filter(i => i.name.toLowerCase().includes(query));
    }
    
    filtered.slice(0, 100).forEach(item => {
        const li = document.createElement('li');
        const typeLabels = { driver: 'Piloto', kart: 'Carro', glider: 'Asa-delta' };
        li.innerHTML = `
            <div class="item-header" style="justify-content: flex-start; gap: 15px;">
                ${getItemImageHtml(item)}
                <div>
                    <span class="item-name" style="display:block;">${item.name}</span>
                    <span class="item-type type-${item.type}">${typeLabels[item.type]}</span> <span style="font-size:0.8rem;color:#888;">${item.rarity}</span>
                </div>
            </div>
            <div class="badge-list">
                ${item.tracks.map(t => `<span class="badge" style="background:#eee;font-size:0.8rem;padding:0.2rem 0.6rem;">${t.name} <strong style="color:var(--mario-red-dark)">(Nv ${t.unlockLevel})</strong></span>`).join('')}
            </div>
        `;
        list.appendChild(li);
    });
    
    if (filtered.length > 100) {
        const li = document.createElement('li');
        li.style.textAlign = 'center';
        li.style.color = '#888';
        li.textContent = `... e mais ${filtered.length - 100} itens. Use a busca.`;
        list.appendChild(li);
    }
}

document.querySelectorAll('.filters button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderDBItems(e.target.dataset.filter);
    });
});

// Exclusive Tracks Logic
function getExclusiveTracks(item) {
    const ownedIds = db.inventory.map(inv => inv.id);
    const otherOwnedItems = db.items.filter(i => i.type === item.type && i.id !== item.id && ownedIds.includes(i.id));
    
    const otherCovered = new Set();
    otherOwnedItems.forEach(i => {
        const invEntry = db.inventory.find(inv => inv.id === i.id);
        const userLvl = invEntry ? invEntry.level : 1;
        i.tracks.forEach(t => {
            if (t.unlockLevel <= userLvl) otherCovered.add(t.name);
        });
    });
    
    const invEntry = db.inventory.find(inv => inv.id === item.id);
    const itemLvl = invEntry ? invEntry.level : 1;
    
    const exclusive = [];
    item.tracks.forEach(t => {
        if (t.unlockLevel <= itemLvl && !otherCovered.has(t.name)) {
            exclusive.push(t.name);
        }
    });
    return exclusive;
}

function getIsRedundant(item) {
    const invEntry = db.inventory.find(inv => inv.id === item.id);
    if (!invEntry) return false;
    
    const itemLvl = invEntry.level;
    
    // Get tracks covered by this item
    const coveredByThis = item.tracks.filter(t => t.unlockLevel <= itemLvl).map(t => t.name);
    if (coveredByThis.length === 0) return true; // If it covers nothing, it's redundant
    
    const ownedIds = db.inventory.map(inv => inv.id);
    const otherOwnedItems = db.items.filter(i => i.type === item.type && i.id !== item.id && ownedIds.includes(i.id));
    
    // Check if every track is covered by another item with level >= itemLvl
    return coveredByThis.every(trackName => {
        return otherOwnedItems.some(otherItem => {
            const otherInvEntry = db.inventory.find(inv => inv.id === otherItem.id);
            if (!otherInvEntry) return false;
            const otherLvl = otherInvEntry.level;
            
            // Does this other item cover this track at its current level?
            const otherCovers = otherItem.tracks.find(t => t.name === trackName && t.unlockLevel <= otherLvl);
            return otherCovers && otherLvl >= itemLvl;
        });
    });
}


function switchInvCategory(event, category) {
    // Update active button
    const buttons = document.querySelectorAll('#inv-category-filters button');
    buttons.forEach(b => b.classList.remove('active'));
    
    // Fallback if event is not passed correctly
    const target = event && event.target ? event.target : document.querySelector(`#inv-category-filters button[onclick*="${category}"]`);
    if (target) target.classList.add('active');
    
    // Hide all sections
    document.getElementById('inv-section-driver').style.display = 'none';
    document.getElementById('inv-section-kart').style.display = 'none';
    document.getElementById('inv-section-glider').style.display = 'none';
    
    // Show selected section
    document.getElementById('inv-section-' + category).style.display = 'block';
}

// Inventory Rendering
function renderInventory() {
    const renderSection = (type, ulId) => {
        const ul = document.getElementById(ulId);
        ul.innerHTML = '';
        const items = db.items.filter(i => i.type === type);
        items.forEach(item => {
            const li = document.createElement('li');
            li.className = 'inv-card';
            li.dataset.order = item.order;
            li.dataset.rarity = item.rarity;
            
            const invEntry = db.inventory.find(inv => inv.id === item.id);
            const isChecked = !!invEntry;
            const level = invEntry ? invEntry.level : 1;
            
            let exclusiveHtml = '';
            if (isChecked) {
                const excl = getExclusiveTracks(item);
                if (excl.length > 0) {
                    exclusiveHtml = `<br><span class="exclusive-badge" title="${excl.join(', ')}">${excl.length} Exclusivas!</span>`;
                }
            }
            
            li.innerHTML = `
                <div class="inv-card-top">
                    ${getItemImageHtml(item)}
                    <label for="inv-${item.id}" style="font-weight: 600;">${item.name} ${exclusiveHtml}</label>
                </div>
                <div class="inv-card-bottom">
                    <input type="checkbox" id="inv-${item.id}" ${isChecked ? 'checked' : ''} onchange="toggleInventory('${item.id}', this.checked)">
                    <div style="display:flex; align-items:center; gap:5px; margin-left: 10px;">
                        <label style="font-size:0.8rem;color:#666;margin:0;">Nível:</label>
                        <select class="level-select" id="lvl-${item.id}" ${!isChecked ? 'disabled' : ''} onchange="changeInventoryLevel('${item.id}', this.value)">
                            ${[1,2,3,4,5,6,7,8].map(l => `<option value="${l}" ${level == l ? 'selected' : ''}>${l}</option>`).join('')}
                        </select>
                    </div>
                </div>
            `;
            ul.appendChild(li);
        });
    };
    renderSection('driver', 'inv-driver-list');
    renderSection('kart', 'inv-kart-list');
    renderSection('glider', 'inv-glider-list');
    
    if (typeof window.applyInventoryFilters === 'function') {
        window.applyInventoryFilters();
    }
}

window.toggleInventory = (id, isChecked) => {
    const select = document.getElementById(`lvl-${id}`);
    if (isChecked) {
        if (!db.inventory.find(i => i.id === id)) {
            db.inventory.push({ id, level: parseInt(select.value) || 1 });
        }
        select.disabled = false;
    } else {
        db.inventory = db.inventory.filter(i => i.id !== id);
        select.disabled = true;
    }
    saveData();
    renderInventory(); // Re-render to update exclusive tracks
};

window.changeInventoryLevel = (id, level) => {
    const entry = db.inventory.find(i => i.id === id);
    if (entry) {
        entry.level = parseInt(level);
        saveData();
        renderInventory(); // Re-render to update exclusive tracks
    }
};

window.applyInventoryFilters = () => {
    const showOnlyExclusive = document.getElementById('inv-filter-exclusive')?.checked;
    
    ['driver', 'kart', 'glider'].forEach(type => {
        const searchInput = document.getElementById(`inv-search-${type}`);
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        
        const ul = document.getElementById(`inv-${type}-list`);
        if (!ul) return;
        const lis = Array.from(ul.querySelectorAll('li'));
        
        lis.forEach(li => {
            const label = li.querySelector('label[for^="inv-"]').textContent.toLowerCase();
            const badge = li.querySelector('.exclusive-badge');
            const hasExclusiveBadge = badge !== null;
            
            // Store exclusive count for sorting
            li.dataset.exclusiveCount = hasExclusiveBadge ? parseInt(badge.textContent) || 0 : 0;
            
            let matchesSearch = label.includes(query);
            let matchesExclusive = showOnlyExclusive ? hasExclusiveBadge : true;
            
            li.style.display = (matchesSearch && matchesExclusive) ? 'flex' : 'none';
        });

        // Sort if exclusive filter is active
        if (showOnlyExclusive) {
            lis.sort((a, b) => {
                return parseInt(b.dataset.exclusiveCount) - parseInt(a.dataset.exclusiveCount);
            });
            // Re-append to update order
            lis.forEach(li => ul.appendChild(li));
        } else {
            // Restore MKT Toolbox original game order using dataset.order
            lis.sort((a, b) => {
                const oA = parseInt(a.dataset.order) || 0;
                const oB = parseInt(b.dataset.order) || 0;
                return oA - oB;
            });
            lis.forEach(li => ul.appendChild(li));
        }
    });
};

['driver', 'kart', 'glider'].forEach(type => {
    const search = document.getElementById(`inv-search-${type}`);
    if (search) {
        search.addEventListener('input', window.applyInventoryFilters);
    }
});

// Recommendations Logic
function getCoverage(type) {
    const ownedIds = db.inventory.map(inv => inv.id);
    const ownedItems = db.items.filter(i => i.type === type && ownedIds.includes(i.id));
    
    const coveredTracks = new Set();
    ownedItems.forEach(i => {
        const invEntry = db.inventory.find(inv => inv.id === i.id);
        const userLvl = invEntry ? invEntry.level : 1;
        
        i.tracks.forEach(t => {
            if (t.unlockLevel <= userLvl) {
                coveredTracks.add(t.name);
            }
        });
    });
    return coveredTracks;
}

function renderRecommendations() {
    const totalTracks = db.allTracks.size;
    
    ['driver', 'kart', 'glider'].forEach(type => {
        const covered = getCoverage(type);
        document.getElementById(`stat-${type}-cov`).textContent = `${covered.size}/${totalTracks}`;
        
        const ownedIds = db.inventory.map(inv => inv.id);
        const unowned = db.items.filter(i => i.type === type && !ownedIds.includes(i.id));
        
        const scores = unowned.map(item => {
            const newTracks = item.tracks.filter(t => t.unlockLevel <= 1 && !covered.has(t.name));
            return { item, newTracks: newTracks.map(t => t.name) };
        }).filter(s => s.newTracks.length > 0);
        
        scores.sort((a, b) => b.newTracks.length - a.newTracks.length);
        
        const listId = `rec-${type}-list`;
        const ul = document.getElementById(listId);
        ul.innerHTML = '';
        
        if (scores.length === 0) {
            ul.innerHTML = '<li style="color:#666;font-size:0.9rem;">Nenhuma recomendação disponível ou você já tem cobertura total.</li>';
            return;
        }

        scores.slice(0, 10).forEach(score => {
            const li = document.createElement('li');
            li.className = 'rec-item';
            li.innerHTML = `
                <div class="rec-header" style="justify-content: flex-start; gap: 10px;">
                    ${getItemImageHtml(score.item)}
                    <div style="flex: 1; display: flex; justify-content: space-between; align-items: center;">
                        <span class="rec-name">${score.item.name}</span>
                        <span class="rec-badge">+${score.newTracks.length} Pistas</span>
                    </div>
                </div>
                <div class="rec-tracks" style="margin-top: 10px;">
                    <strong>Pistas Novas (Nv 1):</strong> ${score.newTracks.join(', ')}
                </div>
            `;
            ul.appendChild(li);
        });

        // Upgrade Recommendations (Owned Items)
        const ownedItems = db.items.filter(i => i.type === type && ownedIds.includes(i.id));
        const upgradeScores = ownedItems.map(item => {
            const exclusiveTracks = getExclusiveTracks(item);
            const invEntry = db.inventory.find(inv => inv.id === item.id);
            const currentLevel = invEntry ? invEntry.level : 1;
            return { item, exclusiveTracks, currentLevel };
        }).filter(s => s.exclusiveTracks.length > 0);

        upgradeScores.sort((a, b) => b.exclusiveTracks.length - a.exclusiveTracks.length);

        const upgListId = `upg-${type}-list`;
        const upgUl = document.getElementById(upgListId);
        if (upgUl) {
            upgUl.innerHTML = '';
            
            if (upgradeScores.length === 0) {
                upgUl.innerHTML = '<li style="color:#666;font-size:0.9rem;">Você ainda não possui itens com exclusividade nesta categoria.</li>';
            } else {
                upgradeScores.slice(0, 10).forEach(score => {
                    const li = document.createElement('li');
                    li.className = 'rec-item';
                    li.innerHTML = `
                        <div class="rec-header" style="justify-content: flex-start; gap: 10px;">
                            ${getItemImageHtml(score.item)}
                            <div style="flex: 1; display: flex; justify-content: space-between; align-items: center;">
                                <span class="rec-name">${score.item.name} <span style="font-size: 0.8rem; color: #888;">(Lvl ${score.currentLevel})</span></span>
                                <span class="rec-badge" style="background-color: #5a2e98;">${score.exclusiveTracks.length} Exclusivas</span>
                            </div>
                        </div>
                        <div class="rec-tracks" style="margin-top: 10px;">
                            <strong>Pistas Cobertas:</strong> ${score.exclusiveTracks.join(', ')}
                        </div>
                    `;
                    upgUl.appendChild(li);
                });
            }
        }

        // Redundancy Tracker
        const redListId = `red-${type}-list`;
        const redUl = document.getElementById(redListId);
        if (redUl) {
            redUl.innerHTML = '';
            
            // Find redundant items (descending by total tracks to show biggest wastes first)
            const redundantItems = ownedItems.filter(getIsRedundant).sort((a, b) => b.tracks.length - a.tracks.length);
            
            if (redundantItems.length === 0) {
                redUl.innerHTML = '<li style="color:#666;font-size:0.9rem;">Ótimo! Você não possui itens obsoletos nesta categoria.</li>';
            } else {
                redundantItems.slice(0, 10).forEach(item => {
                    const invEntry = db.inventory.find(inv => inv.id === item.id);
                    const lvl = invEntry ? invEntry.level : 1;
                    const li = document.createElement('li');
                    li.className = 'rec-item';
                    li.innerHTML = `
                        <div class="rec-header" style="justify-content: flex-start; gap: 10px; border-bottom: none; margin-bottom: 0;">
                            ${getItemImageHtml(item)}
                            <div style="flex: 1;">
                                <span class="rec-name" style="text-decoration: line-through; color: #888;">${item.name}</span>
                                <span style="font-size: 0.8rem; color: #c41c18; font-weight: bold;">(Lvl ${lvl})</span>
                            </div>
                        </div>
                    `;
                    redUl.appendChild(li);
                });
            }
        }
    });
}

// Ranking Logic
function renderRanking() {
    const typeFilter = document.getElementById('rank-type-filter').value;
    const rarityFilter = document.getElementById('rank-rarity-filter').value;
    
    let filtered = db.items;
    if (typeFilter !== 'all') filtered = filtered.filter(i => i.type === typeFilter);
    if (rarityFilter !== 'all') filtered = filtered.filter(i => i.rarity === rarityFilter);
    
    // Sort by total tracks
    filtered.sort((a, b) => b.tracks.length - a.tracks.length);
    
    const list = document.getElementById('ranking-list');
    list.innerHTML = '';
    
    const typeLabels = { driver: 'Piloto', kart: 'Carro', glider: 'Asa-delta' };
    
    filtered.slice(0, 100).forEach((item, index) => {
        const li = document.createElement('li');
        li.style.background = '#fdfdfd';
        li.style.border = '1px solid #eee';
        li.style.padding = '1rem';
        li.style.marginBottom = '10px';
        li.style.borderRadius = '8px';
        
        let exclusiveHtml = '';
        const isOwned = db.inventory.find(i => i.id === item.id);
        if (isOwned) {
            const excl = getExclusiveTracks(item);
            if (excl.length > 0) {
                exclusiveHtml = `<span class="exclusive-badge" title="${excl.join(', ')}">${excl.length} Exclusivas!</span>`;
            }
        }
        
        li.innerHTML = `
            <div class="item-header" style="justify-content: flex-start;">
                <div style="display:flex; align-items:center; gap:15px; width:100%;">
                    <span class="rank-position">#${index + 1}</span>
                    ${getItemImageHtml(item)}
                    <div style="flex:1;">
                        <span class="item-name">${item.name}</span>
                        <div style="margin-top:4px;">
                            <span class="item-type type-${item.type}">${typeLabels[item.type]}</span>
                            <span class="item-rarity-badge rarity-${item.rarity}">${item.rarity}</span>
                            ${exclusiveHtml}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <strong style="font-size:1.5rem; color:var(--mario-red-dark);">${item.tracks.length}</strong>
                        <div style="font-size:0.8rem; color:#666; font-weight:bold;">Pistas Totais</div>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(li);
    });
}

document.getElementById('rank-type-filter').addEventListener('change', renderRanking);
document.getElementById('rank-rarity-filter').addEventListener('change', renderRanking);
// App Backup JSON Export / Import
window.exportAppBackup = function() {
    if (!currentProfile) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ inventory: db.inventory }));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "meu_inventario_mkt.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

document.getElementById('app-backup-file')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const data = JSON.parse(event.target.result);
            if (data && data.inventory) {
                db.inventory = data.inventory;
                saveData();
                renderInventory();
                alert("Backup restaurado com sucesso!");
            } else {
                alert("Arquivo de backup inválido.");
            }
        } catch (err) {
            alert("Erro ao ler o arquivo de backup.");
        }
        e.target.value = '';
    };
    reader.readAsText(file);
});

// MKT Toolbox Import
document.getElementById('mkt-toolbox-file')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const text = event.target.result;
        importMKTToolboxCSV(text);
        // Reset input
        e.target.value = '';
    };
    reader.readAsText(file);
});

function importMKTToolboxCSV(csvText) {
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) {
        alert("O arquivo CSV parece estar vazio ou inválido.");
        return;
    }

    // Detect delimiter
    const headerLine = lines[0];
    const delimiter = headerLine.includes(';') ? ';' : ',';
    const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase());

    const nameIdx = headers.findIndex(h => h === 'name' || h === 'item' || h === 'name_en');
    const levelIdx = headers.findIndex(h => h === 'level' || h === 'lvl');

    if (nameIdx === -1 || levelIdx === -1) {
        alert("Não foi possível encontrar as colunas 'Name' e 'Level' no CSV.");
        return;
    }

    let importedCount = 0;

    for (let i = 1; i < lines.length; i++) {
        // Handle quotes in CSV if needed, but a simple split is usually enough for basic MKT names without commas
        // MKT names don't typically have commas, but let's be safe with a basic regex split for CSV
        let row = [];
        if (delimiter === ',') {
            // Regex to split by comma, ignoring commas inside quotes
            const matches = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
            if (matches) row = matches.map(m => m.replace(/(^"|"$)/g, '').trim());
            else row = lines[i].split(',').map(c => c.trim());
        } else {
            row = lines[i].split(';').map(c => c.trim());
        }

        if (row.length <= Math.max(nameIdx, levelIdx)) continue;

        let name = row[nameIdx];
        let level = parseInt(row[levelIdx]);

        if (!name || isNaN(level) || level < 1) continue;

        // Try to find the item in our DB
        // Normalizing spaces and quotes might be needed
        const dbItem = db.items.find(item => item.name.toLowerCase() === name.toLowerCase());

        if (dbItem) {
            // Update or add to inventory
            const existingInv = db.inventory.find(inv => inv.id === dbItem.id);
            if (existingInv) {
                existingInv.level = level;
            } else {
                db.inventory.push({ id: dbItem.id, level: level });
            }
            importedCount++;
        }
    }

    if (importedCount > 0) {
        saveData();
        renderInventory();
        alert(`Importação concluída! ${importedCount} itens foram sincronizados do seu arquivo.`);
    } else {
        alert("Nenhum item válido foi encontrado ou sincronizado do arquivo. Verifique se os nomes batem com o banco de dados (Inglês).");
    }
}

// Init
loadProfiles();
renderDBItems();
