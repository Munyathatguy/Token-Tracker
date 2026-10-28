# Desktop controls (v0.2)

The default is a **compact strip**, 260 × 96 logical pixels at 100% app size. On a Windows display scaled to 125%, this is approximately 325 × 120 screen pixels. Native window bounds may round by one logical pixel. Current and weekly remaining usage remain the prominent numbers; auxiliary labels are intentionally smaller.

## Controls directly on the bubble and dashboard
- **A− / A+**: scale the compact strip down/up, including its text (80–140%).
- **Percentage**: cycle bubble opacity through 75%, 50% and 100%. Hover for opacity and transparency values; Settings offers a continuous 35–100% slider.
- **Sun/moon**: switch light/dark theme. Settings also supports following the system theme.
- **Visibility symbol**: toggle always visible / only on observed updates. The latter hides the bubble until a qualifying event. Restore manually using the tray icon.
- **Pin**: toggle always-on-top. Its highlighted state reflects the saved preference.
- **Gear**: open Settings. **Expand** opens the full bubble, **minus** hides to tray. Click the metrics to open the dashboard.

## Settings
Display behaviour has four explicit choices:
1. Always visible, optionally pinned above other windows.
2. Only on AI updates/activity: compact pop-up, no keyboard-focus theft, then automatic return to tray.
3. Floating icon only: no automatic strip pop-ups. Click the icon for the compact strip.
4. Tray icon only: no floating window or automatic pop-ups; use the tray menu to restore.

Also configurable: overall compact size, base width, opacity, theme, preferred account, context/risk visibility, compaction count, clock, timezone, expanded session-row count, pop-up duration, delivery/activity triggers, low-allowance desktop notifications and ordered warning/prepare/wrap-up thresholds.

Current and weekly remaining allowances, source identity and stale-reading indications cannot be hidden in the compact usage view. The dashboard remains fully detailed regardless of bubble visibility settings. Preferences persist locally across restarts; changing display defaults never removes session history.

## What triggers a pop-up
- Claude prompt/start hooks and MCP tool responses notify the monitor **after** writing a model-facing awareness response to their client transport. A short-lived, single-use delivery ticket avoids treating ordinary polling/copying as delivery.
- Codex local `Work started` / `Response completed`, and supported Claude prompt/stop events, can produce separately labelled **observed activity** pop-ups. Initial historical backfill never triggers these; only newly observed recent events qualify.
- A client transport write is not proof the model consumed or acted on the update. Automatic injection into existing Codex Desktop chats is still not connected.
- Open expanded views are not collapsed by incoming events. Consecutive pop-up events refresh one timer/window. Manual interaction cancels automatic hiding. Tray-only and floating-icon-only modes suppress automatic pop-ups.
- Settings includes an explicit preview that shows no claim of model delivery and does not consume AI tokens.
