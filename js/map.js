const map = L.map('map', { zoomControl: true }).setView([41.7798, -71.4373], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
}).addTo(map);

const sidebarBody = document.getElementById('sidebar-body');
const searchInput = document.getElementById('search-input');

let allMarkers = [];
let activeMarker = null;

const defaultStyle = { radius: 7, fillColor: '#3b82f6', color: 'white', weight: 2, opacity: 1, fillOpacity: 0.85 };
const activeStyle  = { radius: 9, fillColor: '#f59e0b', color: 'white', weight: 2, opacity: 1, fillOpacity: 1 };

function createMarker(loc) {
    const marker = L.circleMarker([loc.lat, loc.lng], { ...defaultStyle });

    marker.bindTooltip(
        `<b>${loc.name}</b><br>${loc.address}<br><small style="color:#64748b">Last inspected: ${loc.last_inspection}</small>`,
        { sticky: true }
    );

    marker.on('click', () => {
        if (activeMarker && activeMarker !== marker) {
            activeMarker.setStyle(defaultStyle);
        }
        marker.setStyle(activeStyle);
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
