const fail = (status, message) => Object.assign(new Error(message), { status });

// Account access changes never move, delete or rewrite learning records or rosters.
export async function changeStudentAccess(firestore, authentication, studentId, disabled) {
  const ref = firestore.doc(`users/${studentId}`);
  const profile = await ref.get();
  if (profile.get("role") !== "student") throw fail(404, "Student account not found.");
  const previous = await authentication.getUser(studentId);
  await authentication.updateUser(studentId, { disabled });
  try {
    await firestore.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.get("role") !== "student") throw fail(404, "Student account not found.");
      const history = (Array.isArray(current.get("inactivePeriods")) ? current.get("inactivePeriods") : []).filter(period=>period&&Number.isFinite(period.start)).map(period => ({ ...period }));
      const now = Date.now();
      if (disabled) {
        if (!history.some(period => period.end == null)) history.push({ start: current.get("disabled") === true ? current.get("deactivatedAt") || 0 : now, end: null });
      } else {
        if (current.get("disabled") === true && !history.some(period => period.end == null)) history.push({ start: current.get("deactivatedAt") || 0, end: now });
        history.forEach(period => { if (period.end == null) period.end = now; });
      }
      tx.update(ref, { disabled, inactivePeriods: history, deactivatedAt: disabled ? history.find(period => period.end == null).start : null });
    });
  } catch (error) {
    await authentication.updateUser(studentId, { disabled: previous.disabled === true });
    throw error;
  }
  if (disabled) await authentication.revokeRefreshTokens(studentId);
  return { studentId, ok: true, disabled };
}
