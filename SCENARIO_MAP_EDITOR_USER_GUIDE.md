# Scenario Map Editor Pro - Visual & Interactive Guide

## User Workflow Example

### Step 1: Open Map Editor
```
Right Panel shows:
┌─────────────────────────────────┐
│ Scenario Map Pro                │
│ [Presets]  [Editor On]          │
├─────────────────────────────────┤
│ World W: 640                    │
│ World H: 480                    │
│ Wall Margin: 20                 │
│ Zoom: 1.00  [Reset View]        │
└─────────────────────────────────┘
```

### Step 2: Place Obstacles
**Action**: Click on canvas 3 times at different positions
```
Canvas shows:
┌─────────────────────────────────┐
│ ┌──────────────────────────────┐│
│ │  #1 110×50                   ││
│ │ ┌─────────────────┐          ││
│ │ │ Obstacle #1     │          ││
│ │ └──────────[O]───┘│          ││  [O] = Resize handle
│ │                   │          ││
│ │      #2 110×50    │   #3     ││
│ │   ┌─────────────┐  │ 110×50  ││
│ │   │ Obstacle #2 │  │┌──────┐││
│ │   └────[O]──────┘  ││  #3  │││
│ │                    │└─[O]──┘││
│ └──────────────────────────────┘│
│ [↶ Undo] [Clear All] 3 obstacles│
└─────────────────────────────────┘
```

### Step 3: Rotate First Obstacle
**Action**: Select obstacle #1, then drag yellow handle in circular motion
```
Before:
┌────────────────────────┐
│  ┌──────────────────┐  │
│  │  Obstacle #1     │  │
│  │  @ 100, 100      │  │
│  │  110×50          │  │
│  │         ⭕ (yellow)│  │
│  └─────────[O]──────┘  │
└────────────────────────┘

After 45° rotation:
┌────────────────────────┐
│      ⭕ (yellow)       │
│    ◇─────────────────┐ │
│   ╱  Obstacle #1 ◇   │ │
│  ╱ ∠45° ◇ 110×50  │  │
│        ◇───────────┘  │
│         [cyan corner] │
└────────────────────────┘
```

Inspector shows:
```
Obstacle #1
├─ X: 100
├─ Y: 100
├─ W: 110
├─ H: 50
└─ Rotation: 45° [|═══════════╪════════=]
```

### Step 4: Zoom & Pan
**Action**: Ctrl+Scroll to zoom 2.0x, Shift+Drag to pan right
```
Zoom Level: 1.00x → 2.00x
- Canvas shows obstacles 2x larger
- All interactions still work (drag, rotate, resize)
- Labels still visible: "#1 110×50 ∠45°"

Pan by (150, 100):
- Entire view shifts right and down
- World boundary moves
- Grid still aligned
```

Inspector shows:
```
Config:
├─ Zoom: 2.00  ← NEW
├─ Pan X: 150  ← NEW
└─ Pan Y: 100  ← NEW
```

Reset button click:
- Zoom → 1.00
- Pan X → 0
- Pan Y → 0

### Step 5: Save Preset
**Action**: Click [Presets] button, enter name "Corridor Sprint", click [SAVE]

Before save:
```
[Presets]
<Preset panel opens>
┌──────────────────────┐
│ [Corridor Sprint] [▼]│
│        [SAVE]        │
│                      │
│ No presets saved     │
└──────────────────────┘
```

After save:
```
[Presets (1)]
<Preset panel expanded>
┌──────────────────────┐
│ [New preset] [▼]     │
│       [SAVE]         │
├──────────────────────┤
│ > Corridor Sprint [✕]│
│                      │
│ Click to load        │
└──────────────────────┘
```

**Saved Preset Contains**:
```json
{
  "name": "Corridor Sprint",
  "config": {
    "enabled": true,
    "worldWidth": 640,
    "worldHeight": 480,
    "wallMargin": 20,
    "obstacles": [
      {"x": 100, "y": 100, "width": 110, "height": 50, "rotation": 45},
      {"x": 250, "y": 200, "width": 110, "height": 50, "rotation": 0},
      {"x": 400, "y": 350, "width": 110, "height": 50, "rotation": -30}
    ],
    "zoom": 2.0,
    "panX": 150,
    "panY": 100,
    "defaultObstacleWidth": 110,
    "defaultObstacleHeight": 50
  }
}
```

### Step 6: Start Training
**Action**: Click "Start Training" button

Payload sent to backend:
```json
{
  "steps": 5000,
  "algorithm": "PPO",
  "environmentProfile": "arena_basic",
  "modelProfile": "balanced",
  "customEnvironment": {
    "world": {
      "width": 640,
      "height": 480,
      "wall_margin": 20,
      "obstacles": [
        {
          "x": 100,
          "y": 100,
          "width": 110,
          "height": 50,
          "rotation": 45
        },
        {
          "x": 250,
          "y": 200,
          "width": 110,
          "height": 50,
          "rotation": 0
        },
        {
          "x": 400,
          "y": 350,
          "width": 110,
          "height": 50,
          "rotation": -30
        }
      ]
    }
  }
}
```

### Step 7: Load & Reuse Preset
**Action**: Later session - Click [Presets], select "Corridor Sprint", modify one obstacle, save as new preset

```
[Presets (1)]
<Panel opens>
┌────────────────────────┐
│ [New preset] [▼]       │
│       [SAVE]           │
├────────────────────────┤
│ > Corridor Sprint [✕]  │ ← Click to load
│                        │
└────────────────────────┘
      ↓ Click
Canvas updates instantly:
- All 3 obstacles appear
- Zoom: 2.0x
- Pan: (150, 100)
- Rotations restored: 45°, 0°, -30°

User then:
- Adjusts one obstacle position
- Updates rotation of obstacle #2 to 60°
- Changes preset name to "Corridor Sprint v2"
- Clicks [SAVE]

Result:
┌────────────────────────┐
│ [New preset] [▼]       │
│       [SAVE]           │
├────────────────────────┤
│ > Corridor Sprint [✕]  │
│ > Corridor Sprint v2[✕]│
│                        │
└────────────────────────┘
```

---

## Keyboard Shortcut Usage Patterns

### Pattern 1: Design Complex Maze
```
1. Place 10+ obstacles with default rotation (0°)
2. Zoom in (Ctrl+Scroll) to detail view
3. Pan around (Shift+Drag) to work on different sections
4. Select & rotate key obstacles for visual interest (45°, -45°)
5. Zoom out (Ctrl+Scroll) to see full picture
6. Save preset as "Complex Maze v1"
```

### Pattern 2: Tight Space Challenge
```
1. Place 3 obstacles close together
2. Zoom 2x for precise placement
3. Rotate all at 30° angles for dynamic appearance
4. Pan to check spacing
5. Fine-tune coordinates in inspector
6. Save as "Tight Space"
7. Load and modify for "Tight Space Hard"
```

### Pattern 3: Quick Clear & Reset
```
1. Unhappy with layout: [Clear All]
2. Start fresh
3. Or [↶ Undo] one obstacle at a time
4. Or click [Reset View] to center canvas
```

---

## Advanced Feature Combination

### Multi-Zoom Design Workflow
```
Canvas Zoom: 1.0x (full view)
  ├─ Place obstacles roughly
  ├─ Adjust world dimensions
  └─→ Zoom to 1.5x (detail work)
      ├─ Fine-tune positions
      ├─ Apply rotations
      ├─ Pan to corners
      └─→ Zoom to 2.5x (final detail)
          ├─ Check obstacle spacing
          ├─ Verify dimension labels
          └─→ [Reset View] to 1.0x
              └─ Save final preset
```

### Preset-Based Iteration Loop
```
Load "Tight Space" preset
  ↓
Modify: Move obstacle, change rotation 45° → 60°
  ↓
Save as "Tight Space v2"
  ↓
Start training run with "Tight Space v2"
  ↓
Results good? → Save as "Final Layout"
Results poor? → Load "Tight Space", try different approach
```

---

## Accessibility & Help

### On-Screen Help (When editor disabled)
```
┌─────────────────────────────┐
│  Enable editor to interact  │
├─────────────────────────────┤
│ Shift+Drag: Pan             │
│ Ctrl+Wheel: Zoom            │
│ Click: Place | Drag: Move   │
│ Yellow: Rotate              │
└─────────────────────────────┘
```

### Label Information
Each obstacle shows:
- `#1` → Obstacle index (order placed)
- `110×50` → Current dimensions (width × height)
- `∠45°` → Rotation (only when != 0°)

### Handle Colors
- 🟦 **Cyan corner** → Resize (bottom-right)
- 🟨 **Yellow circle** → Rotate (top-center)

---

## Typical Scenario Designs

### Scenario: "Warehouse Dense"
```
8 tall obstacles (rotations: 0°, 45°, 90°, 135°, 0°, 45°, 90°, 135°)
Tight spacing, multiple aisles
Preset zoom: 1.5x (see layout overview)
Training: PPO, 10k steps
```

### Scenario: "Sprint Corridor"
```
2-3 obstacles on sides, diagonal rotation
Wide path in middle for speed
Preset zoom: 1.0x
Training: DQN (discrete), 5k steps
```

### Scenario: "Complex T-Junction"
```
4 obstacles forming T shape - rotations staggered
Narrow turns, path decision points
Preset zoom: 1.2x, pan to junction center
Training: A2C, 15k steps
```

---

## Copy-Paste Preset JSON (For Sharing)

Users can share presets by copy-pasting JSON:

```json
{
  "name": "Team Standard: Warehouse Tight",
  "config": {
    "enabled": true,
    "worldWidth": 800,
    "worldHeight": 600,
    "wallMargin": 25,
    "obstacles": [
      {"x": 100, "y": 100, "width": 120, "height": 60, "rotation": 0},
      {"x": 300, "y": 150, "width": 100, "height": 100, "rotation": 45},
      {"x": 550, "y": 200, "width": 80, "height": 120, "rotation": -45},
      {"x": 350, "y": 400, "width": 120, "height": 60, "rotation": 90}
    ],
    "zoom": 1.2,
    "panX": 0,
    "panY": 0,
    "defaultObstacleWidth": 100,
    "defaultObstacleHeight": 60
  }
}
```

Recipient could:
1. Load preset in UI (future: import modal)
2. Modify for their needs
3. Add to team library

---

## Error States & Recovery

| State | Display | Recovery |
|-------|---------|----------|
| No obstacles | "0 obstacles" counter | Click canvas to place |
| Out of bounds | Clamped to limits | Inspector shows corrected X/Y |
| Invalid rotation | Normalized to 0-360 | Slider shows valid value |
| Zoom too far | Clamped to 0.5-3x | Use [Reset View] button |
| Pan off-screen | Constrained by canvas | Use [Reset View] button |

---

## Performance Tips

- [ ] Keep obstacles < 50 for responsive interaction
- [ ] Use zoom for detail work on complex layouts
- [ ] Save presets before major modifications
- [ ] Clear unused obstacles to reduce clutter
- [ ] Reset view if canvas feels sluggish (very large pan offset)

---

## Next Steps (User POV)

1. ✅ Design scenario with map editor
2. ✅ Save preset with meaningful name
3. ✅ Adjust Scenario Builder dynamics (noise, drift)
4. ✅ Choose training template (autonomous-driving, drone, etc.)
5. ✅ Click "Start Training"
6. ✅ Monitor metrics in real-time
7. ✅ Download deployment bundle when ready
8. ✅ Deploy to robot!
