const map = L.map('map', { zoomControl: true }).setView([41.7798, -71.4373], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
}).addTo(map);

const sidebarBody = document.getElementById('sidebar-body');
const searchInput = document.getElementById('search-input');

let allMarkers = [];
let activeMarker = null;

function clusterColor(markers) {
    const scores = markers
        .map(m => m.locationData?.risk_score)
        .filter(s => s != null);
    if (!scores.length) return '#94a3b8';
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg >= 10) return '#ef4444';
    if (avg >= 3)  return '#f59e0b';
    return '#22c55e';
}

const markerCluster = L.markerClusterGroup({
    maxClusterRadius: 40,
    iconCreateFunction(cluster) {
        const markers = cluster.getAllChildMarkers();
        const color   = clusterColor(markers);
        const count   = cluster.getChildCount();
        return L.divIcon({
            html: `<div class="cluster-icon" style="background:${color}">${count}</div>`,
            className: '',
            iconSize: [36, 36],
        });
    },
});
markerCluster.addTo(map);

function activeStyle(loc) {
    const base = markerStyle(loc);
    return { ...base, radius: 10, weight: 3, fillOpacity: 1 };
}

function markerStyle(loc) {
    const s = loc.risk_score;
    let fillColor;
    if (s == null) fillColor = '#94a3b8';       // grey  — no data
    else if (s <= 2)  fillColor = '#22c55e';   // green — low risk
    else if (s <= 9)  fillColor = '#f59e0b';   // amber — moderate risk
    else              fillColor = '#ef4444';   // red   — high risk
    return { radius: 7, fillColor, color: 'white', weight: 2, opacity: 1, fillOpacity: 0.85 };
}

function violationLabel(loc) {
    const s = loc.risk_score;
    if (s == null) return 'No data';
    if (s === 0)   return '✓ Clean';
    if (s <= 2)    return 'Low risk';
    if (s <= 9)    return 'Moderate risk';
    return 'High risk';
}

function createMarker(loc) {
    const marker = L.circleMarker([loc.lat, loc.lng], markerStyle(loc));

    marker.bindTooltip(
        `<b>${loc.name}</b><br>${loc.address}<br><small style="color:#64748b">Last inspected: ${loc.last_inspection} · ${violationLabel(loc)}</small>`,
        { sticky: true }
    );

    marker.on('click', () => {
        setSidebarCollapsed(false);
        setActiveTab('explore');
        if (activeMarker && activeMarker !== marker) {
            activeMarker.setStyle(markerStyle(activeMarker.locationData));
        }
        marker.setStyle(activeStyle(loc));
        marker.bringToFront();
        activeMarker = marker;
        fetchInspectionData(loc);
        sidebarBody.scrollTop = 0;
    });

    marker.locationData = loc;
    return marker;
}

async function loadLocations() {
    try {
        const res = await fetch('data/locations.json');
        const locations = await res.json();

        locations.forEach(loc => {
            if (!loc.lat || !loc.lng) return;
            allMarkers.push(createMarker(loc));
        });
        markerCluster.addLayers(allMarkers);
    } catch (err) {
        console.error('Failed to load locations:', err);
    }
}

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

const mainContent = document.querySelector('.main-content');

function setSidebarCollapsed(collapsed) {
    sidebar.classList.toggle('collapsed', collapsed);
    mainContent.classList.toggle('sidebar-collapsed', collapsed);
    map.invalidateSize();
}

// Sidebar starts collapsed on mobile
setSidebarCollapsed(true);

sidebarToggle.addEventListener('click', () => {
    setSidebarCollapsed(!sidebar.classList.contains('collapsed'));
});

// ── Filters ──────────────────────────────────────────────────────────────────

const activeFilters = {
    severity: new Set(['clean', 'moderate', 'bad', 'nodata']),
    recency:  new Set(['recent', 'year', 'old', 'stale']),
};

const NOW = Date.now();

function severityValue(loc) {
    const s = loc.risk_score;
    if (s == null) return 'nodata';
    if (s <= 2)    return 'clean';
    if (s <= 9)    return 'moderate';
    return 'bad';
}

function recencyValue(loc) {
    const parts = (loc.last_inspection || '').split('-').map(Number);
    if (parts.length !== 3) return 'stale';
    const dt = new Date(parts[2], parts[0] - 1, parts[1]);
    const days = (NOW - dt) / 86400000;
    if (days <= 180) return 'recent';
    if (days <= 365) return 'year';
    if (days <= 730) return 'old';
    return 'stale';
}

function applyFilters() {
    if (worstOffendersActive) return;
    const q = searchInput.value.trim().toLowerCase();
    allMarkers.forEach(marker => {
        const loc = marker.locationData;
        const match = (!q || loc.name.toLowerCase().includes(q) || loc.address.toLowerCase().includes(q))
            && activeFilters.severity.has(severityValue(loc))
            && activeFilters.recency.has(recencyValue(loc));

        if (match && !markerCluster.hasLayer(marker)) markerCluster.addLayer(marker);
        if (!match && markerCluster.hasLayer(marker)) markerCluster.removeLayer(marker);
    });
}

const TOTAL_PILLS = document.querySelectorAll('.pill').length;

function updateFiltersBadge() {
    const inactive = document.querySelectorAll('.pill:not(.active)').length;
    const badge = document.getElementById('filters-badge');
    if (inactive > 0) {
        badge.textContent = `${inactive} off`;
        badge.hidden = false;
    } else {
        badge.hidden = true;
    }
}

document.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
        const { filter, value } = btn.dataset;
        if (activeFilters[filter].has(value)) {
            if (activeFilters[filter].size === 1) return;
            activeFilters[filter].delete(value);
            btn.classList.remove('active');
        } else {
            activeFilters[filter].add(value);
            btn.classList.add('active');
        }
        updateFiltersBadge();
        applyFilters();
    });
});

const filtersPanel = document.getElementById('filters-panel');
const tabBtns      = document.querySelectorAll('.tab-btn');

const PLACEHOLDER_HTML = `
    <div class="placeholder">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0L6.343 16.657a8 8 0 1111.314 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        <p>Click a map pin to view inspection history</p>
    </div>`;

function setActiveTab(tab) {
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    const showFilters = tab === 'filters';
    filtersPanel.hidden = !showFilters;
    sidebarBody.hidden = showFilters;

    if (tab === 'worst') {
        if (!worstOffendersActive) activateWorstOffenders();
    } else {
        if (worstOffendersActive) deactivateWorstOffenders();
    }
}

tabBtns.forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

searchInput.addEventListener('input', () => {
    setActiveTab('explore');
    applyFilters();
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
        currentListFn = null;
        document.getElementById('sidebar-body').innerHTML = `
            <div class="placeholder">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                        d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0L6.343 16.657a8 8 0 1111.314 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <p>Click a map pin to view inspection history</p>
            </div>`;
        return;
    }
    const matches = allMarkers
        .filter(m => {
            const loc = m.locationData;
            return loc.name.toLowerCase().includes(q) || loc.address.toLowerCase().includes(q);
        })
        .map(m => m.locationData);
    renderLocationList(matches, `${matches.length} result${matches.length !== 1 ? 's' : ''} for "${q}"`);
});

function flyToLocation(loc) {
    setSidebarCollapsed(false);
    setActiveTab('explore');
    map.setView([loc.lat, loc.lng], 16);
    const marker = allMarkers.find(m => String(m.locationData.id) === String(loc.id));
    if (marker) {
        if (activeMarker && activeMarker !== marker) {
            activeMarker.setStyle(markerStyle(activeMarker.locationData));
        }
        marker.setStyle(activeStyle(marker.locationData));
        marker.bringToFront();
        activeMarker = marker;
    }
    fetchInspectionData(loc);
    document.getElementById('sidebar-body').scrollTop = 0;
}

let worstOffendersActive = false;

function activateWorstOffenders() {
    worstOffendersActive = true;
    const top = allMarkers
        .map(m => m.locationData)
        .filter(loc => loc.risk_score != null)
        .sort((a, b) => b.risk_score - a.risk_score)
        .slice(0, 50);

    const topIds = new Set(top.map(loc => String(loc.id)));
    allMarkers.forEach(marker => {
        const inTop = topIds.has(String(marker.locationData.id));
        if (inTop && !markerCluster.hasLayer(marker)) markerCluster.addLayer(marker);
        if (!inTop && markerCluster.hasLayer(marker)) markerCluster.removeLayer(marker);
    });

    setSidebarCollapsed(false);
    renderLocationList(top, '🚨 Worst Offenders', { field: 'score', dir: 'desc' });
}

function deactivateWorstOffenders() {
    worstOffendersActive = false;
    currentListFn = null;
    applyFilters();
    sidebarBody.innerHTML = PLACEHOLDER_HTML;
}

loadLocations();

// ── Near Me ──────────────────────────────────────────────────────────────────

let userMarker = null;

const nearMeBtn = document.getElementById('near-me-btn');

nearMeBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        return;
    }

    nearMeBtn.classList.add('loading');

    navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
            nearMeBtn.classList.remove('loading');
            const { latitude: lat, longitude: lng } = coords;

            map.setView([lat, lng], 14);

            if (userMarker) userMarker.remove();
            userMarker = L.circleMarker([lat, lng], {
                radius: 9,
                fillColor: '#3b82f6',
                color: 'white',
                weight: 3,
                opacity: 1,
                fillOpacity: 1,
            }).addTo(map).bindTooltip('You are here', { permanent: false });
        },
        () => {
            nearMeBtn.classList.remove('loading');
            alert('Could not get your location. Please check your browser permissions.');
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
});
