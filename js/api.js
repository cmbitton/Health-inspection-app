async function fetchInspectionData(loc) {
    const sidebarBody = document.getElementById('sidebar-body');
    sidebarBody.innerHTML = `
        <div class="loader">
            <div class="spinner"></div>
            <span>Loading inspection records…</span>
        </div>`;

    try {
        const res = await fetch(`data/inspections/${loc.id}.json`);
        if (res.status === 404) {
            renderInspections(loc, []);
            return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderInspections(loc, data);
    } catch (err) {
        sidebarBody.innerHTML = `
            <div class="error-msg">
                Could not load inspection data.
            </div>`;
    }
}
