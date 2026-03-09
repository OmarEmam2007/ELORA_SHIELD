function canActOnTarget({ guild, invokerMember, targetMember }) {
    if (!guild || !invokerMember || !targetMember) {
        return { ok: false, reason: 'missing_context' };
    }

    if (invokerMember.id === targetMember.id) {
        return { ok: false, reason: 'self_target' };
    }

    if (targetMember.id === guild.ownerId) {
        return { ok: false, reason: 'target_is_owner' };
    }

    const invokerPos = invokerMember.roles?.highest?.position ?? 0;
    const targetPos = targetMember.roles?.highest?.position ?? 0;

    if (invokerPos <= targetPos) {
        return { ok: false, reason: 'invoker_not_higher' };
    }

    return { ok: true };
}

module.exports = {
    canActOnTarget
};
