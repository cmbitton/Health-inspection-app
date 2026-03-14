const map = L.map('map', { zoomControl: true }).setView([41.7798, -71.4373], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
}).addTo(map);

const sidebarBody = document.getElementById('sidebar-body');
const searchInput = document.getElementById('search-input');

let allMarkers = [];
let activeMarker = null;

function activeStyle(loc) {
    const base = markerStyle(loc);
    return { ...base, radius: 10, weight: 3, fillOpacity: 1 };
}

function markerStyle(loc) {
    const n = loc.violation_count;
    let fillColor;
    if (n == null)  fillColor = '#94a3b8';       // grey  — no data
    else if (n <= 2) fillColor = '#22c55e';       // green — 0-2
    else if (n <= 4) fillColor = '#f59e0b';       // amber — 3-4
    else             fillColor = '#ef4444';       // red   — 5+
    return { radius: 7, fillColor, color: 'white', weight: 2, opacity: 1, fillOpacity: 0.85 };
}

function violationLabel(n) {
    if (n == null)  return 'No data';
    if (n === 0)    return '✓ Clean';
    return `${n} violation${n !== 1 ? 's' : ''}`;
}

function createMarker(loc) {
    const marker = L.circleMarker([loc.lat, loc.lng], markerStyle(loc));

    marker.bindTooltip(
        `<b>${loc.name}</b><br>${loc.address}<br><small style="color:#64748b">Last inspected: ${loc.last_inspection} · ${violationLabel(loc.violation_count)}</small>`,
        { sticky: true }
    );

    marker.on('click', () => {
        setSidebarCollapsed(false);
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
            const marker = createMarker(loc);
            marker.addTo(map);
            allMarkers.push(marker);
        });
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
    const n = loc.violation_count;
    if (n == null)  return 'nodata';
    if (n <= 2)     return 'clean';
    if (n <= 4)     return 'moderate';
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
    const q = searchInput.value.trim().toLowerCase();
    allMarkers.forEach(marker => {
        const loc = marker.locationData;
        const match = (!q || loc.name.toLowerCase().includes(q) || loc.address.toLowerCase().includes(q))
            && activeFilters.severity.has(severityValue(loc))
            && activeFilters.recency.has(recencyValue(loc));

        if (match && !map.hasLayer(marker)) marker.addTo(map);
        if (!match && map.hasLayer(marker)) map.removeLayer(marker);
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

const filtersToggle = document.getElementById('filters-toggle');
const filtersPanel  = document.getElementById('filters-panel');

filtersToggle.addEventListener('click', () => {
    const open = !filtersPanel.hidden;
    filtersPanel.hidden = open;
    filtersToggle.classList.toggle('open', !open);
});

searchInput.addEventListener('input', applyFilters);

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
