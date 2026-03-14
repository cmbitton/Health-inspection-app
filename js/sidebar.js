// ── List view ─────────────────────────────────────────────────────────────────

let currentListFn = null;

function cleanlinessScore(loc) {
    if (loc.risk_score == null) return null;
    return Math.round(100 * Math.exp(-loc.risk_score * 0.07));
}

function riskColor(loc) {
    const s = loc.risk_score;
    if (s == null) return '#94a3b8';
    if (s <= 2)    return '#22c55e';
    if (s <= 9)    return '#f59e0b';
    return '#ef4444';
}

function riskLabel(loc) {
    const s = loc.risk_score;
    if (s == null) return 'No data';
    if (s === 0)   return 'Clean';
    if (s <= 2)    return 'Low risk';
    if (s <= 9)    return 'Moderate';
    return 'High risk';
}

const PAGE_SIZE = 20;
let _listLocations = [];
let _listOffset = 0;

function renderLocationList(locations, title) {
    currentListFn = () => renderLocationList(locations, title);
    _listLocations = locations;
    _listOffset = 0;

    const sidebarBody = document.getElementById('sidebar-body');

    if (!locations.length) {
        sidebarBody.onscroll = null;
        sidebarBody.innerHTML = `<div class="placeholder"><p>No results found.</p></div>`;
        return;
    }

    sidebarBody.innerHTML = `<div class="list-title">${escHtml(title)}</div><div id="list-items"></div>`;
    appendListItems();

    sidebarBody.onscroll = () => {
        if (_listOffset >= _listLocations.length) return;
        if (sidebarBody.scrollTop + sidebarBody.clientHeight >= sidebarBody.scrollHeight - 120) {
            appendListItems();
        }
    };
}

function appendListItems() {
    const batch = _listLocations.slice(_listOffset, _listOffset + PAGE_SIZE);
    _listOffset += batch.length;
    const container = document.getElementById('list-items');

    batch.forEach(loc => {
        const score = cleanlinessScore(loc);
        const scoreDisplay = score !== null ? score : '—';
        const div = document.createElement('div');
        div.className = 'list-item';
        div.dataset.id = String(loc.id);
        div.innerHTML = `
            <div class="list-dot" style="background:${riskColor(loc)}"></div>
            <div class="list-info">
                <div class="list-name">${escHtml(loc.name)}</div>
                <div class="list-address">${escHtml(loc.address)}</div>
            </div>
            <div class="cleanliness-score" style="color:${riskColor(loc)}">${scoreDisplay}<span class="cs-label">/100</span></div>`;
        div.addEventListener('click', () => {
            const l = _listLocations.find(x => String(x.id) === div.dataset.id);
            if (l) flyToLocation(l);
        });
        container.appendChild(div);
    });
}

// ── Inspection detail ─────────────────────────────────────────────────────────

function renderInspections(loc, data) {
    const sidebarBody = document.getElementById('sidebar-body');
    sidebarBody.onscroll = null;

    let html = currentListFn
        ? `<button class="back-btn" id="back-btn">← Back</button>`
        : '';

    const score = cleanlinessScore(loc);
    html += `
        <div class="loc-header">
            <div class="loc-header-top">
                <div class="loc-name">${escHtml(loc.name)}</div>
                ${score !== null ? `<div class="cleanliness-score large" style="color:${riskColor(loc)}">${score}<span class="cs-label">/100</span></div>` : ''}
            </div>
            <div class="loc-meta">
                <span>📍 ${escHtml(loc.address)}</span>
                <span>🗓 Last inspected: ${escHtml(loc.last_inspection)}</span>
                <span>🏷 ${escHtml(loc.license_type)}</span>
            </div>
        </div>`;

    if (!data || data.length === 0) {
        html += `<p style="color:#64748b;font-size:0.875rem;">No inspection history found.</p>`;
        sidebarBody.innerHTML = html;
        return;
    }

    data.forEach(inspection => {
        const date = (inspection.columns?.['0'] ?? '').replace('Inspection Date: ', '').trim();
        const type = (inspection.columns?.['1'] ?? '').replace('Inspection Purpose: ', '').trim();
        const violations = inspection.violations ? Object.values(inspection.violations).filter(v => v?.[0]) : [];
        const hasViolations = violations.length > 0;

        html += `<div class="inspection-card">
            <div class="card-top">
                <span class="card-date">${escHtml(date)}</span>
                <span class="badge ${hasViolations ? 'badge-violations' : 'badge-clean'}">
                    ${hasViolations ? `${violations.length} Violation${violations.length !== 1 ? 's' : ''}` : 'Clean'}
                </span>
            </div>
            <div class="card-type">${escHtml(type)}</div>`;

        if (hasViolations) {
            violations.forEach(v => {
                html += `<div class="violation">${escHtml(v[0])}</div>`;
            });
        } else {
            html += `<div class="no-violations">✓ No violations reported</div>`;
        }

        if (inspection.printablePath) {
            const reportUrl = `https://ri.healthinspections.us/${inspection.printablePath.replace('../', '')}`;
            html += `<a class="report-link" href="${escHtml(reportUrl)}" target="_blank" rel="noopener">
                View Official Report →
            </a>`;
        }

        html += `</div>`;
    });

    sidebarBody.innerHTML = html;

    document.getElementById('back-btn')?.addEventListener('click', currentListFn);
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
