function renderInspections(loc, data) {
    const sidebarBody = document.getElementById('sidebar-body');

    let html = `
        <div class="loc-header">
            <div class="loc-name">${escHtml(loc.name)}</div>
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
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
