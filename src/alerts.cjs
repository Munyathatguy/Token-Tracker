class AlertEngine {
  constructor(store) {
    this.store = store;
  }
  evaluate(now = Date.now()) {
    const s = this.store.snapshot(),
      p = s.settings,
      out = [];
    for (const a of s.accounts)
      for (const scope of ["current", "weekly"]) {
        const w = a[scope];
        if (!w) continue;
        const stamp = w.reportedAt || a.at;
        const base = a.id + ":" + scope + ":" + (w.resetsAt || "unknown");
        const session = s.sessions.find(
          (x) => x.client === a.client && x.account === a.owner,
        );
        const emit = (
          kind,
          title,
          body,
          sound = false,
          id = base + ":" + kind,
        ) => {
          const alert = {
            id,
            at: now,
            kind,
            title,
            body,
            sound,
            volume: p.soundVolume,
            scope,
            accountId: a.id,
            client: a.client,
            sessionId: session?.id || "",
            notification: "pending",
            soundStatus: sound ? "pending" : "disabled",
          };
          if (this.store.recordAlert(alert)) out.push(alert);
        };
        const due = w.resetsAt && w.resetsAt <= now;
        if (!due && now - stamp < 600000) {
          if (
            w.remaining > p.alertPrepareRemaining &&
            w.remaining <= p.alertWarnRemaining
          )
            emit(
              "warning",
              `${a.client} ${scope}: ${w.remaining}% left — usage warning`,
              "Plan remaining work around the shared account allowance.",
              p.soundOnWarning,
            );
          if (
            w.remaining > p.alertWrapRemaining &&
            w.remaining <= p.alertPrepareRemaining
          )
            emit(
              "prepare",
              `${a.client} ${scope}: ${w.remaining}% left — prepare to finish`,
              "Finish essential changes, verify work and prepare a handoff. This is a user alert, not evidence of model delivery.",
            );
          if (w.remaining > 0 && w.remaining <= p.alertWrapRemaining)
            emit(
              "wrap",
              `${a.client} ${scope}: ${w.remaining}% left — wrap up`,
              "Save verified progress, remaining tasks and background-job details.",
            );
          if (w.remaining === 0)
            emit(
              "exhausted",
              `${a.client} ${scope} allowance exhausted — 0% left`,
              w.resetsAt
                ? "Scheduled reset: " +
                    new Date(w.resetsAt).toLocaleString(undefined, {
                      timeZone: p.timezone,
                    })
                : "Reset time not reported by provider.",
              p.soundOnExhaustion,
            );
        }
        if (
          due &&
          p.notifyOnReset &&
          (w.remaining <= p.alertPrepareRemaining || p.resetAlarmForAll)
        )
          emit(
            "reset-due",
            `${a.client} ${scope}: scheduled reset time reached`,
            "The scheduled time has arrived. Checking the provider; availability is not confirmed until refreshed.",
            p.soundOnReset,
          );
        const key = "lastQuota:" + a.id + ":" + scope,
          previous = this.store.get("settings", key);
        if (
          !due &&
          previous?.remaining === 0 &&
          w.remaining > 0 &&
          stamp > previous.reportedAt &&
          now - stamp < 600000
        )
          emit(
            "available",
            `${a.client} ${scope}: usage available again`,
            `${w.remaining}% remaining, confirmed by a fresh provider reading.`,
            p.soundOnReset,
            base + ":available:" + previous.resetsAt,
          );
        this.store.put("settings", key, {
          remaining: w.remaining,
          reportedAt: stamp,
          resetsAt: w.resetsAt,
        });
      }
    return out;
  }
}
module.exports = { AlertEngine };
