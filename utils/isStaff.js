const { STAFF_ROLES } = require("../config/roles");

function isStaff(member) {
    if (!member || !member.roles) return false;

    // GuildMember uses roles.cache
    if (member.roles.cache && typeof member.roles.cache.has === 'function') {
        return (
            member.roles.cache.has(STAFF_ROLES.MANAGER) ||
            member.roles.cache.has(STAFF_ROLES.OWNER)
        );
    }

    // APIInteractionGuildMember uses roles array of string IDs
    if (Array.isArray(member.roles)) {
        return (
            member.roles.includes(STAFF_ROLES.MANAGER) ||
            member.roles.includes(STAFF_ROLES.OWNER)
        );
    }

    return false;
}

module.exports = isStaff;