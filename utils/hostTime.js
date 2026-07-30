const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const SESSION_HOURS = [0, 4, 8, 12, 16, 20];

function getWibParts(date = new Date()) {
    const wibDate = new Date(date.getTime() + WIB_OFFSET_MS);

    return {
        year: wibDate.getUTCFullYear(),
        month: wibDate.getUTCMonth(),
        day: wibDate.getUTCDate(),
        hour: wibDate.getUTCHours(),
        minute: wibDate.getUTCMinutes(),
        second: wibDate.getUTCSeconds(),
    };
}

function getCurrentSessionEndUnix(now = new Date()) {
    const wibParts = getWibParts(now);
    const currentMinutes = wibParts.hour * 60 + wibParts.minute + wibParts.second / 60;

    const nextSessionHour = SESSION_HOURS.find(hour => hour * 60 > currentMinutes) ?? 24;

    const nextWibMidnightUtc = Date.UTC(wibParts.year, wibParts.month, wibParts.day, 0, 0, 0) - WIB_OFFSET_MS;
    const sessionEndUtc = nextWibMidnightUtc + (nextSessionHour * 60 * 60 * 1000);

    return Math.floor(sessionEndUtc / 1000);
}

function formatWibTime(unixSeconds) {
    return new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date(unixSeconds * 1000));
}

module.exports = {
    getCurrentSessionEndUnix,
    formatWibTime,
};
