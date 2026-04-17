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

    const SEV_RANK = { P: 0, Pf: 1, C: 2 };

    data.forEach((inspection, idx) => {
        const violations = [...(inspection.violations || [])].sort(
            (a, b) => (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3)
        );
        const hasViolations = violations.length > 0;
        const collapsed = idx > 0;  // only the most recent is expanded by default

        html += `<div class="inspection-card${collapsed ? ' collapsed' : ''}">
            <div class="card-top">
                <span class="card-date">${escHtml(inspection.date)}</span>
                <span class="badge ${hasViolations ? 'badge-violations' : 'badge-clean'}">
                    ${hasViolations ? `${violations.length} Violation${violations.length !== 1 ? 's' : ''}` : 'Clean'}
                </span>
                <span class="card-chevron" aria-hidden="true">▾</span>
            </div>
            <div class="card-type">${escHtml(inspection.type)}</div>
            <div class="card-body">`;

        if (hasViolations) {
            violations.forEach(v => {
                const sev = (v.severity || 'C').toLowerCase();
                html += `<div class="violation sev-${sev}">
                    <span class="violation-code">${escHtml(v.code)}</span>
                    <span class="violation-text">${escHtml(v.text)}</span>
                </div>`;
            });
            html += `<div class="violation-legend">
                <span class="legend-sev sev-p">Priority</span>
                <span class="legend-sev sev-pf">Priority Foundation</span>
                <span class="legend-sev sev-c">Core</span>
            </div>`;
        } else {
            html += `<div class="no-violations">✓ No violations reported</div>`;
        }

        if (inspection.reportUrl) {
            html += `<a class="report-link" href="${escHtml(inspection.reportUrl)}" target="_blank" rel="noopener">
                View Official Report →
            </a>`;
        }

        html += `</div></div>`;
    });

    sidebarBody.innerHTML = html;

    sidebarBody.querySelectorAll('.inspection-card').forEach(card => {
        const header = card.querySelector('.card-top');
        header.addEventListener('click', () => card.classList.toggle('collapsed'));
    });

    document.getElementById('back-btn')?.addEventListener('click', currentListFn);
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
