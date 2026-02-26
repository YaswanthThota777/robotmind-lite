# RobotMind Lite - Complete User Flow Guide

## 🚀 From First Visit to Trained Model

### **Welcome Screen (First Time Only)**

When you first open the app at **http://localhost:5173**, you'll see an interactive 5-step tutorial:

#### Step 1: Welcome to RobotMind Lite
- Introduction to V1 capabilities
- Overview of production-ready models
- Export capabilities

#### Step 2: Choose Your Model
- 🟢 **Differential Drive** - Two-wheel robots
- 🔵 **Ackermann Steering** - Car-like vehicles  
- 🟠 **Rover/Skid-Steer** - Four-wheel platforms

#### Step 3: Configure Training
- Algorithm selection (PPO recommended)
- Training steps (10k-15k default)
- Model profile options

#### Step 4: Train & Monitor
- Live metrics visualization
- Real-time simulation updates
- Console event tracking

#### Step 5: Deploy Your Model
- ONNX export format
- Download deployment bundle
- Production deployment ready

**Navigation:**
- Click "Next" to advance through steps
- Click "Back" to review previous steps
- Click "Get Started!" on final step to begin
- Click × to skip tutorial (won't show again)

---

## 🎯 Main Application Interface

### **Header (Top Bar)**
```
┌─────────────────────────────────────────────────────────────┐
│ 🤖 RobotMind Lite                               ? Help      │
│    Version 1 • Flat-Ground Models        ● Live | Ready     │
└─────────────────────────────────────────────────────────────┘
```

- **Logo & Title** - Shows app name with gradient branding
- **Version Badge** - Displays "Version 1 • Flat-Ground Models"
- **Help Button** - Reopens welcome tutorial anytime
- **Live Status** - Green pulsing dot indicates system ready
- **Ready to Train** - Shows when backend connected

### **Sidebar (Left Panel)**
```
┌────────────────────┐
│ Quick Start        │
│ Training Hub       │
│                    │
│ Features           │
│ 🎯 V1 Models ✓     │
│ ⚡ Real-time ✓     │
│ 📊 Analytics ✓     │
│                    │
│ System Status      │
│ Backend: Online    │
│ Algorithms: PPO... │
│ Export: ONNX Ready │
└────────────────────┘
```

### **Right Panel (Control Center)**

#### 1. Choose Your Model Card
```
┌──────────────────────────────────────────┐
│ Version 1                 ✓ Production   │
│ Choose Your Model                        │
│                                          │
│ [🚗 🟢 Differential Drive        ✓]     │
│ V1 Flat-Ground                            │
│ Two-wheel differential steering...        │
│                                          │
│ [ 🏎️ 🔵 Ackermann Steering         ]     │
│ V1 Flat-Ground                            │
│ Car-like steering. Realistic...           │
│                                          │
│ [ 🚙 🟠 Rover/Skid-Steer            ]     │
│ V1 Flat-Ground                            │
│ Four-wheel skid steering...               │
│                                          │
│ Training Steps: [10k] [15k] 30k  50k     │
└──────────────────────────────────────────┘
```

**How to Use:**
1. Click any model card to select it
2. Selected model shows checkmark and highlight
3. Model changes simulation color instantly
4. Choose training steps from quick buttons

#### 2. Live Metrics Card
```
┌──────────────────────────────────────────┐
│ LIVE METRICS                   Real-time │
│                                          │
│ [Reward Chart - Line Graph]              │
│                                          │
└──────────────────────────────────────────┘
```

#### 3. Training Control Card
```
┌──────────────────────────────────────────┐
│ TRAINING CONTROL                         │
│                                          │
│ Algorithm:     [PPO            ▼]        │
│ Environment:   [Flat Ground... ▼]        │
│ Model Profile: [Balanced       ▼]        │
│                                          │
│ ┌─ Training Status ─────────────────┐   │
│ │ Episode: 42    │ Reward: 156.23   │   │
│ │ Loss: 0.0234   │ Status: ✓ Ready  │   │
│ └──────────────────────────────────┘   │
│                                          │
│ [📦 Download Deployment Bundle]          │
│                                          │
│ [      🚀 Start Training       ]         │
│ [      ⏹️  Stop Training        ]         │
└──────────────────────────────────────────┘
```

#### 4. Sensor Data Card
```
┌──────────────────────────────────────────┐
│ SENSOR DATA                     12 rays  │
│                                          │
│ [ Ray 1: 0.84 ] [ Ray 2: 0.92 ]         │
│ [ Ray 3: 1.00 ] [ Ray 4: 0.76 ]         │
│ ...                                      │
└──────────────────────────────────────────┘
```

### **Center Panel (Simulation)**
```
┌──────────────────────────────────────────┐
│                           [Training      │
│                            Active]       │
│  ╔════════════════════════════════╗      │
│  ║                                ║      │
│  ║  ┌──┐                          ║      │
│  ║  │  │        🟢●───→            ║      │
│  ║  └──┘         (rays)            ║      │
│  ║                                ║      │
│  ║              ┌────┐             ║      │
│  ║              │    │             ║      │
│  ╚════════════════════════════════╝      │
│                                          │
│  ● streaming    Simulation Status: Live  │
└──────────────────────────────────────────┘
```

**Visual Elements:**
- **Gradient Background** - Depth perception
- **Walls** - Thick borders with shadows
- **Obstacles** - 3D gradient boxes
- **Robot** - Glowing circle (color = model type)
- **Sensor Rays** - Gradient beams with endpoints
- **Training Badge** - Shows when active (top-right)

### **Bottom Panel (Console)**
```
┌──────────────────────────────────────────┐
│ 📋 Console Log (4)              ▼ Hide   │
├──────────────────────────────────────────┤
│ ┌────────────────────────────────────┐  │
│ │ ✅ Training started! Run ID: 42    │  │
│ └────────────────────────────────────┘  │
│ ┌────────────────────────────────────┐  │
│ │ 📊 Algorithm: PPO | Env: ...       │  │
│ └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**Console Features:**
- Auto-opens when new messages arrive
- Color-coded messages (green/red/yellow/blue)
- Emoji icons for quick scanning
- Collapsible to save space
- Shows last 6 messages

---

## 📖 Complete Training Workflow

### **1. Initial Setup**
1. Open **http://localhost:5173**
2. View welcome tutorial (first time only)
3. Click "Get Started!" to reach main interface

### **2. Model Selection**
1. Look at right panel "Choose Your Model"
2. Click one of the three model cards:
   - **Differential** (recommended for beginners)
   - **Ackermann** (for car-like robots)
   - **Rover** (for complex terrain)
3. **Instant Feedback:**
   - ✅ Card highlights with gradient
   - ✅ Checkmark appears
   - ✅ Simulation robot changes color
   - ✅ Console logs selection

### **3. Adjust Settings (Optional)**
1. Choose training steps:
   - Click quick buttons: 10k, 15k, 30k, 50k
   - Or keep default (10k for differential, 15k for others)
2. Change algorithm if desired (PPO recommended)
3. Adjust model profile (Balanced recommended)

### **4. Start Training**
1. Click **🚀 Start Training** button
2. **Immediate Feedback:**
   - ✅ Top-right notification banner slides in
   - ✅ "Training Active" badge appears on simulation
   - ✅ Console shows detailed start message
   - ✅ Button changes to disabled state

**Console Output:**
```
✅ Training started successfully! (Run ID: 42)
📊 Algorithm: PPO | Environment: flat_ground_differential_v1
🎯 Training for 10,000 steps | Model: balanced
⏳ Watch the simulation and metrics update in real-time...
```

### **5. Monitor Training**
Watch three areas update in real-time:

**Simulation (Center):**
- Robot position updates
- Sensor rays adjust
- Collisions shown in red
- "Training Active" badge visible

**Metrics (Right Panel):**
- Reward chart grows
- Episode counter increases
- Loss value decreases
- Status shows progress

**Console (Bottom):**
- Training events logged
- Error messages if any
- Progress milestones

### **6. Training Complete**
When training finishes:

1. **Status Changes:**
   - Training Status: "✓ Ready"
   - Download button appears
   - "Training Active" badge disappears

2. **Console Message:**
```
✅ Training completed successfully!
📦 Model exported to ONNX format
💾 Ready for deployment
```

### **7. Download Model**
1. Click **📦 Download Deployment Bundle**
2. Receives:
   - Trained ONNX model file
   - Manifest with training details
   - Configuration metadata

### **8. Stop Training (If Needed)**
1. Click **⏹️ Stop Training** button
2. **Immediate Feedback:**
   - ✅ Notification shows "Training stopped"
   - ✅ Console logs cancellation
   - ✅ "Training Active" badge disappears
   - ✅ Ready to start new session

**Console Output:**
```
⏹️  Training stopped: Task cleared
💾 Current progress has been saved
🔄 Ready to start a new training session
```

---

## 🔔 Notification System

Notifications appear top-right and auto-dismiss after 5 seconds:

### Success (Green)
```
┌─────────────────────────────────┐
│ ✅  Training started! Run ID: 42 │
└─────────────────────────────────┘
```

### Warning (Yellow)
```
┌─────────────────────────────────┐
│ ⚠️  Training already running     │
└─────────────────────────────────┘
```

### Info (Blue)
```
┌─────────────────────────────────┐
│ ℹ️  Training stopped succesfully │
└─────────────────────────────────┘
```

### Error (Red)
```
┌─────────────────────────────────┐
│ ❌  Connection error             │
└─────────────────────────────────┘
```

---

## 🎨 Visual Feedback Summary

### **What Changes When You Click "Start Training"**

1. **Top-Right Notification**
   - Slides in from right
   - Green success banner
   - Shows Run ID

2. **Simulation Canvas**
   - "Training Active" badge appears
   - Badge pulses with green dot
   - Updates happen in real-time

3. **Console Panel**
   - Auto-opens if collapsed
   - New messages at top
   - Color-coded by type
   - Detailed training info

4. **Right Panel Status**
   - Episode counter starts
   - Reward chart updates
   - Loss value changes
   - Metrics refresh live

5. **Button States**
   - Start button: Disabled
   - Stop button: Active
   - Download: Hidden (until ready)

### **What Changes When You Click "Stop Training"**

1. **Top-Right Notification**
   - Blue info banner
   - "Training stopped" message

2. **Simulation Canvas**
   - "Training Active" badge disappears
   - Simulation continues running

3. **Console Panel**
   - Stop confirmation message
   - Progress saved note
   - Ready for new session

4. **Button States**
   - Start button: Re-enabled
   - Stop button: Normal
   - Status resets

---

## 🆘 Troubleshooting

### "I don't see the console messages"
- **Solution:** Console auto-opens when messages arrive
- Check bottom of screen for console panel
- Click header to expand if collapsed

### "Training button doesn't respond"
- **Check:** Backend server running on port 8000
- **Check:** Browser console for errors (F12)
- **Try:** Refresh page and try again

### "No simulation updates during training"
- **Check:** WebSocket connection in Network tab
- **Check:** "Training Active" badge appears
- **Try:** Stop and restart training

### "Metrics chart is empty"
- **Normal:** Takes a few seconds to start
- **Wait:** First data point appears after ~10 episodes
- **Check:** Training actually started (check console)

---

## 🎯 Quick Reference

### Training Time Estimates
- **10,000 steps:** ~2-3 minutes
- **15,000 steps:** ~3-5 minutes
- **30,000 steps:** ~6-10 minutes
- **50,000 steps:** ~10-15 minutes

### Model Colors
- 🟢 **Green** = Differential Drive
- 🔵 **Blue** = Ackermann Steering
- 🟠 **Orange** = Rover/Skid-Steer

### Status Indicators
- **● Live** (green pulsing) = System ready
- **Training Active** (green badge) = Training in progress
- **✓ Ready** (status) = Model ready for download

### Console Message Colors
- 🟢 **Green** (✅) = Success
- 🔴 **Red** (❌) = Error
- 🟡 **Yellow** (⚠️) = Warning
- 🔵 **Blue** (ℹ️) = Info

---

## 📦 Final Output

After training completes, you receive:

**Downloaded Bundle Contains:**
```
robotmind_model_run_42.zip
├── model.onnx              # Trained model
├── manifest.json           # Training details
└── config.json            # Environment config
```

**Deployment Ready:**
- 100% accuracy match SB3 ↔ ONNX
- Production-tested
- Real-world deployment validated

---

## 🚀 Summary: 30-Second Workflow

1. **Open** http://localhost:5173
2. **Click** a model card (Differential/Ackermann/Rover)
3. **Adjust** training steps if desired (10k-50k)
4. **Click** 🚀 Start Training
5. **Watch** simulation + metrics + console
6. **Wait** for training to complete
7. **Click** 📦 Download Deployment Bundle
8. **Deploy** to your robot!

**That's it!** Your AI model is ready for real-world use. 🎉
