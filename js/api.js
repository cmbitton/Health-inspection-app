const PROXY_BASE = '/api-proxy';

async function fetchInspectionData(loc) {
    document.getElementById('sidebar').classList.remove('collapsed');
    const sidebarBody = document.getElementById('sidebar-body');
    sidebarBody.innerHTML = `
        <div class="loader">
            <div class="spinner"></div>
            <span>Loading inspection records…</span>
        </div>`;

    const encodedId = btoa(String(loc.id));
    const url = `${PROXY_BASE}/inspectionsData/${encodedId}`;

    try {
        const res = await fetch(url, { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderInspections(loc, data);
    } catch (err) {
        sidebarBody.innerHTML = `
            <div class="error-msg">
                Could not load inspection data. The state server may be blocking cross-origin requests (CORS).
            </div>`;
    }
}
