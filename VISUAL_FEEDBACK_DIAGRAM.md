# Visual Feedback Flow Diagram

## When You Click "Start Training"

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER CLICKS                              │
│                    🚀 Start Training Button                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     IMMEDIATE FEEDBACK                           │
│                       (< 100ms)                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1️⃣  TOP-RIGHT NOTIFICATION                                      │
│     ┌─────────────────────────────────────────┐                │
│     │ ✅ Training started! Run ID: 42          │ ← Slides in    │
│     └─────────────────────────────────────────┘   from right    │
│                                                                  │
│  2️⃣  CONSOLE PANEL (Bottom)                                      │
│     📋 Console Log (4)                    ▼ Hide                │
│     ┌──────────────────────────────────────────────┐           │
│     │ ✅ Training started successfully! (Run: 42)   │           │
│     │ 📊 Algorithm: PPO | Env: differential_v1     │ ← Opens   │
│     │ 🎯 Training for 10,000 steps | Model: bal... │   auto    │
│     │ ⏳ Watch simulation and metrics in real-time │           │
│     └──────────────────────────────────────────────┘           │
│                                                                  │
│  3️⃣  SIMULATION CANVAS                                           │
│     ┌─────────────────────────────────────────┐                │
│     │              [Training Active] ← Badge   │                │
│     │  ╔═══════════════════════════╗           │                │
│     │  ║                           ║           │                │
│     │  ║    🟢●───→               ║           │ ← Pulsing    │
│     │  ║     (rays updating)       ║           │   green dot  │
│     │  ╚═══════════════════════════╝           │                │
│     └─────────────────────────────────────────┘                │
│                                                                  │
│  4️⃣  RIGHT PANEL STATUS                                          │
│     ┌─ Training Status ─────────────────┐                       │
│     │ Episode: 1 → 2 → 3... ← Counting  │                       │
│     │ Reward: 0.0 → 12.5... ← Growing   │                       │
│     │ Loss: 0.8234 → 0.534. ← Changing  │                       │
│     │ Status: Training...   ← Active    │                       │
│     └──────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONTINUOUS UPDATES                            │
│                    (Every few seconds)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📊 Metrics Chart:  ──── (line growing right)                   │
│  🤖 Robot Position: (x, y) changing every frame                 │
│  📡 Sensor Rays:    Values updating continuously                │
│  🎯 Episode Count:  Incrementing every episode                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TRAINING COMPLETE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ✅ Status: "✓ Ready"                                            │
│  📦 Download Button Appears                                      │
│  🏷️  "Training Active" Badge Disappears                         │
│  📋 Console: "Training completed successfully!"                 │
│  🔔 Notification: "Model ready for deployment"                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## When You Click "Stop Training"

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER CLICKS                              │
│                    ⏹️  Stop Training Button                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     IMMEDIATE FEEDBACK                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1️⃣  TOP-RIGHT NOTIFICATION                                      │
│     ┌─────────────────────────────────────────┐                │
│     │ ℹ️  Training stopped successfully        │ ← Blue banner │
│     └─────────────────────────────────────────┘                │
│                                                                  │
│  2️⃣  CONSOLE PANEL                                               │
│     ┌──────────────────────────────────────────────┐           │
│     │ ⏹️  Training stopped: Task cleared           │           │
│     │ 💾 Current progress has been saved           │           │
│     │ 🔄 Ready to start a new training session     │           │
│     └──────────────────────────────────────────────┘           │
│                                                                  │
│  3️⃣  SIMULATION CANVAS                                           │
│     ┌─────────────────────────────────────────┐                │
│     │  [Training Active] ← Badge REMOVED       │                │
│     │  ╔═══════════════════════════╗           │                │
│     │  ║    🟢●───→               ║           │ ← Continues  │
│     │  ║    (still running)        ║           │   running    │
│     │  ╚═══════════════════════════╝           │                │
│     └─────────────────────────────────────────┘                │
│                                                                  │
│  4️⃣  BUTTON STATES                                               │
│     [  🚀 Start Training   ] ← Re-enabled                       │
│     [  ⏹️  Stop Training    ] ← Back to normal                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Notification Types & Colors

```
SUCCESS (Green)
┌─────────────────────────────────────────┐
│ ✅  Training started! Run ID: 42         │  Auto-dismiss: 5s
│                                       × │  Color: Emerald
└─────────────────────────────────────────┘

ERROR (Red)
┌─────────────────────────────────────────┐
│ ❌  Failed to start training             │  Auto-dismiss: 5s
│                                       × │  Color: Red
└─────────────────────────────────────────┘

WARNING (Yellow)
┌─────────────────────────────────────────┐
│ ⚠️  Training already running             │  Auto-dismiss: 5s
│                                       × │  Color: Amber
└─────────────────────────────────────────┘

INFO (Blue)
┌─────────────────────────────────────────┐
│ ℹ️  Training stopped successfully        │  Auto-dismiss: 5s
│                                       × │  Color: Cyan
└─────────────────────────────────────────┘
```

## Console Message Colors

```
✅ Success  → Emerald-300  → Training started, models exported
❌ Error    → Red-300      → Connection failed, API errors
⚠️  Warning → Amber-300    → Already running, conflicts
🚀 Action   → Cyan-300     → User actions, system events
💡 Info     → Blue-300     → Tips, suggestions
📊 Data     → Slate-400    → Metrics, technical details
```

## State Transitions

```
IDLE STATE
├─ Button: "Start Training" (enabled, green)
├─ Badge: None
├─ Console: Welcome messages
└─ Status: "Ready"

          │ Click Start Training
          ▼

TRAINING STATE
├─ Button: "Start Training" (disabled, gray)
├─ Badge: "Training Active" (visible, pulsing)
├─ Console: Training messages
├─ Status: "Training..."
└─ Metrics: Updating

          │ Training Completes OR Click Stop
          ▼

COMPLETE STATE
├─ Button: "Start Training" (enabled, green)
├─ Badge: None
├─ Console: Completion message
├─ Status: "✓ Ready"
└─ Download: Available (if completed)
```

## Quick Reference: What Changes Where

| Action              | Notification | Console | Badge | Metrics | Simulation |
|---------------------|-------------|---------|-------|---------|------------|
| Select Model        | -           | Yes     | -     | -       | Color      |
| Start Training      | ✅ Green     | Yes     | Show  | Start   | Active     |
| Training Progress   | -           | Events  | Pulse | Update  | Update     |
| Training Complete   | ✅ Green     | Yes     | Hide  | Final   | Continues  |
| Stop Training       | ℹ️ Blue      | Yes     | Hide  | Pause   | Continues  |
| Error Occurs        | ❌ Red       | Yes     | -     | -       | -          |
| Already Running     | ⚠️ Yellow    | Yes     | -     | -       | -          |

## Animation Timings

- **Notification Slide-in:** 300ms ease-out
- **Notification Auto-dismiss:** 5000ms (5 seconds)
- **Badge Pulse:** 2s infinite
- **Console Open:** 200ms
- **Button State Change:** Instant (< 16ms)
- **Metrics Update:** 1-2s intervals
- **Simulation FPS:** 60fps (16.6ms per frame)

---

**Everything you click now has immediate, visible feedback!** 🎉
