const { STAFF_ROLES } = require("../config/roles");

function isStaff(member) {
    return (
        member.roles.cache.has(STAFF_ROLES.MANAGER) ||
        member.roles.cache.has(STAFF_ROLES.OWNER)
    );
}

module.exports = isStaff;