function restaurarHorarioCorrompido(str) {
    if (!str) return null;
    const parts = str.split(':');
    if (parts.length !== 2) return str;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes) || hours < 100) return str;
    
    const totalMinutes = hours * 60 + minutes;
    const serial = totalMinutes / (24 * 60);
    
    // Use UTC to avoid historical timezone offset changes (e.g. LMT in 1899)
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

console.log("Restaurado '1109793:30' ->", restaurarHorarioCorrompido('1109793:30'));
console.log("Restaurado '1109804:30' ->", restaurarHorarioCorrompido('1109804:30'));
console.log("Restaurado '1109526:00' ->", restaurarHorarioCorrompido('1109526:00'));
console.log("Restaurado '1109531:40' ->", restaurarHorarioCorrompido('1109531:40'));
