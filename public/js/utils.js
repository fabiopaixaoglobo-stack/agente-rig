export function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function showToast(message, type = 'info', duration = 3000) {
    // Implementação simples de toast (pode ser melhorada com CSS)
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, duration);
}

export function formatBadge(text) {
    if (!text) return '';
    return text.split('/')[0].trim();
}

export function formatarHorario(valor) {
    if (valor == null || valor === '' || valor === 'N/D' || valor === 'undefined' || valor === 'null' || valor === 0 || valor === '0') {
        return 'Horário não informado';
    }
    const str = String(valor).trim();
    if (str === '' || str.toUpperCase() === 'N/D' || str === 'null' || str === 'undefined') {
        return 'Horário não informado';
    }
    
    // Check if it's the corrupted format (e.g. 1109793:30)
    if (str.includes(':')) {
        const parts = str.split(':');
        if (parts.length === 2) {
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            if (!isNaN(hours) && !isNaN(minutes) && hours >= 100) {
                // Restore corrupted Excel hour format
                const totalMinutes = hours * 60 + minutes;
                const serial = totalMinutes / (24 * 60);
                const epoch = Date.UTC(1899, 11, 30);
                const ms = Math.round(serial * 24 * 60 * 60 * 1000);
                const date = new Date(epoch + ms);
                
                const dia = String(date.getUTCDate()).padStart(2, '0');
                const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
                const ano = date.getUTCFullYear();
                const hr = String(date.getUTCHours()).padStart(2, '0');
                const min = String(date.getUTCMinutes()).padStart(2, '0');
                return `${dia}/${mes}/${ano} ${hr}:${min}`;
            }
        }
    }
    
    return str;
}
