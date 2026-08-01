const { HOST_ROLES } = require("../config/roles");

function getHostRole(member) {
    if (!member || !member.roles) return null;

    for (const [roleName, roleId] of Object.entries(HOST_ROLES)) {
        // GuildMember uses roles.cache
        if (member.roles.cache && typeof member.roles.cache.has === 'function') {
            if (member.roles.cache.has(roleId)) {
                return roleName;
            }
        } 
        // APIInteractionGuildMember uses roles array of string IDs
        else if (Array.isArray(member.roles)) {
            if (member.roles.includes(roleId)) {
                return roleName;
            }
        }
    }

    return null;
}

module.exports = getHostRole;