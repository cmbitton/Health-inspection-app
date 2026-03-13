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

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
});

searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    allMarkers.forEach(marker => {
        const loc = marker.locationData;
        const match = !q
            || loc.name.toLowerCase().includes(q)
            || loc.address.toLowerCase().includes(q);

        if (match && !map.hasLayer(marker)) marker.addTo(map);
        if (!match && map.hasLayer(marker)) map.removeLayer(marker);
    });
});

loadLocations();
