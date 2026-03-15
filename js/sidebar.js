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
let _sortedCache   = [];
let _listOffset    = 0;
let _sortField     = 'score';
let _sortDir       = 'asc';

function formatDate(str) {
    if (!str) return '';
    const [m, d, y] = str.split('-');
    if (!y) return str;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[+m - 1]} ${+d}, ${y}`;
}

function dateValue(str) {
    if (!str) return 0;
    const [m, d, y] = str.split('-').map(Number);
    return (y || 0) * 10000 + (m || 0) * 100 + (d || 0);
}

function buildSortedCache() {
    return [..._listLocations].sort((a, b) => {
        let va, vb;
        if (_sortField === 'score') {
            va = a.risk_score ?? Infinity;
            vb = b.risk_score ?? Infinity;
        } else if (_sortField === 'date') {
            va = dateValue(a.last_inspection);
            vb = dateValue(b.last_inspection);
        } else {
            va = a.name.toLowerCase();
            vb = b.name.toLowerCase();
        }
        if (va < vb) return _sortDir === 'asc' ? -1 : 1;
        if (va > vb) return _sortDir === 'asc' ? 1 : -1;
        return 0;
    });
}

function renderSortBar() {
    const fields = [
        { field: 'score', label: 'Score', defaultDir: 'asc'  },
        { field: 'date',  label: 'Date',  defaultDir: 'desc' },
        { field: 'name',  label: 'Name',  defaultDir: 'asc'  },
    ];
    return `<div class="sort-bar">${fields.map(({ field, label, defaultDir }) => {
        const active = _sortField === field;
        const arrow  = active ? (_sortDir === 'asc' ? ' ↑' : ' ↓') : '';
        return `<button class="sort-btn${active ? ' active' : ''}" data-field="${field}" data-default-dir="${defaultDir}">${escHtml(label)}<span class="sort-arrow">${arrow}</span></button>`;
    }).join('')}</div>`;
}

function renderLocationList(locations, title, defaultSort = { field: 'score', dir: 'asc' }) {
    currentListFn = () => renderLocationList(locations, title, defaultSort);
    _listLocations = locations;
    _sortField     = defaultSort.field;
    _sortDir       = defaultSort.dir;
    _sortedCache   = buildSortedCache();
    _listOffset    = 0;

    const sidebarBody = document.getElementById('sidebar-body');

    if (!locations.length) {
        sidebarBody.onscroll = null;
        sidebarBody.innerHTML = `<div class="placeholder"><p>No results found.</p></div>`;
        return;
    }

    sidebarBody.innerHTML = `<div class="list-title">${escHtml(title)}</div>${renderSortBar()}<div id="list-items"></div>`;

    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const { field } = btn.dataset;
            if (_sortField === field) {
                _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                _sortField = field;
                _sortDir   = btn.dataset.defaultDir;
            }
            _sortedCache = buildSortedCache();
            _listOffset  = 0;
            document.querySelectorAll('.sort-btn').forEach(b => {
                const isActive = b.dataset.field === _sortField;
                b.classList.toggle('active', isActive);
                b.querySelector('.sort-arrow').textContent = isActive ? (_sortDir === 'asc' ? ' ↑' : ' ↓') : '';
            });
            document.getElementById('list-items').innerHTML = '';
            appendListItems();
        });
    });

    appendListItems();

    sidebarBody.onscroll = () => {
        if (_listOffset >= _sortedCache.length) return;
        if (sidebarBody.scrollTop + sidebarBody.clientHeight >= sidebarBody.scrollHeight - 120) {
            appendListItems();
        }
    };
}

function appendListItems() {
    const batch = _sortedCache.slice(_listOffset, _listOffset + PAGE_SIZE);
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
                <div class="list-meta">${escHtml(formatDate(loc.last_inspection))}</div>
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
