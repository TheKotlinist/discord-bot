const { HOST_ROLES } = require("../config/roles");

function getHostRole(member) {

    for (const [roleName, roleId] of Object.entries(HOST_ROLES)) {

        if (member.roles.cache.has(roleId)) {
            return roleName;
        }

    }

    return null;

}

module.exports = getHostRole;