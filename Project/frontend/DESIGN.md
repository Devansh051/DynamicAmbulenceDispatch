---
name: Dynamic Ambulance Dispatch System
description: Mission-Critical Tactical Dispatch & Fleet Telemetry Command Console
colors:
  primary: "#2563EB"
  primary-hover: "#1D4ED8"
  accent-telemetry: "#38BDF8"
  status-operational: "#10B981"
  status-warning: "#F59E0B"
  status-emergency: "#EF4444"
  bg-command: "#0B0F19"
  surface-card: "#131B2E"
  surface-card-hover: "#1B253D"
  border-subtle: "#1F2E4D"
  text-primary: "#F8FAFC"
  text-muted: "#94A3B8"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.15
  headline:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "JetBrains Mono, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.05em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  card-surface:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: Dynamic Ambulance Dispatch System

## Overview

**Creative North Star: "The Tactical Telemetry Grid"**

The Dynamic Ambulance Dispatch System design language is engineered for mission-critical emergency triage where split-second clarity, immediate scanability, and zero visual ambiguity save lives. The interface operates as an electronic emergency management HUD: dark navy backgrounds minimize ocular fatigue in 24/7 command centers, high-contrast borders carve unambiguous structural boundaries, and semantic color beacons signal priority without cognitive overload.

Data density is deliberately high, structured in balanced modular panels rather than sprawling consumer white-space. Status indicators pair crisp typographic labeling with distinct shape cues so information is instantly interpretable even in peripheral vision or high-stress situations.

**Key Characteristics:**
- Deep tactical slate foundation (`#0B0F19`) with nested container surfaces (`#131B2E`).
- Monospace precision typography (`JetBrains Mono`) for telemetry values, coordinates, incident codes, and OTPs.
- Clear semantic status beaconing: Emergency Crimson (`#EF4444`), Operational Emerald (`#10B981`), Warning Amber (`#F59E0B`), and Telemetry Sky Blue (`#38BDF8`).
- High-contrast 1px technical borders (`#1F2E4D`) establishing rigid visual hierarchy without heavy drop-shadows.

## Colors

The color palette reflects an authoritative, clinical command environment prioritizing state recognition over decorative aesthetics.

### Primary
- **Cobalt Dispatch** (`#2563EB`): The primary operational action color. Dedicated to primary CTAs, active dispatch triggers, selected navigation states, and confirmed actions.
- **Deep Cobalt** (`#1D4ED8`): Hover and pressed state for primary interactions.

### Secondary
- **Telemetry Sky** (`#38BDF8`): Secondary accent for real-time telemetry markers, GPS radar rings, live timers, and active vehicle telemetry cards.

### Tertiary
- **Operational Emerald** (`#10B981`): Status beacon for available fleet units, healthy system links, and resolved emergency states.
- **Amber Caution** (`#F59E0B`): Warning beacon for low fuel thresholds (<20%), stale GPS updates (>15m), and unassigned high-priority triage items.
- **Emergency Crimson** (`#EF4444`): Critical emergency alert beacon for Level 1/2 severe incidents, cardiac/trauma alerts, and assignment conflicts.

### Neutral
- **Command Abyss** (`#0B0F19`): Global application backdrop. Eliminates eye strain and creates deep contrast.
- **Panel Surface** (`#131B2E`): Card container background for incident logs, vehicle grids, and map HUD drawers.
- **Panel Surface Hover** (`#1B253D`): Interactive hover background for table rows and card items.
- **Subtle Division** (`#1F2E4D`): Crisp technical 1px borders, separators, and card boundaries.
- **Command Text** (`#F8FAFC`): High-legibility primary heading and value text.
- **Telemetry Muted** (`#94A3B8`): Secondary metadata, field labels, units, and timestamps.

### Named Rules
**The Rarity Rule.** Emergency Crimson (`#EF4444`) and Amber Caution (`#F59E0B`) are strictly reserved for genuine incident severity and hardware alerts. They must never be used for generic branding or decorative flourishes.

**The State Dual-Coding Rule.** Status colors must always be accompanied by a text label, numeric value, or distinct icon so state is never communicated through color alone.

## Typography

The typographic system utilizes a paired pairing: clean, highly legible grotesque sans-serif for UI layout and a geometric monospace face for numerical telemetry and identification codes.

**Display Font:** Inter, system-ui, -apple-system, sans-serif
**Body Font:** Inter, system-ui, -apple-system, sans-serif
**Label/Mono Font:** JetBrains Mono, Consolas, Courier New, monospace

**Character:** Clinical, disciplined, and strictly hierarchical. Numbers never shift column alignments thanks to tabular figures and monospace sizing.

### Hierarchy
- **Display** (Bold 700, 2rem - 2.5rem, line-height 1.15): Primary dashboard summary counters and command center title banners.
- **Headline** (Semi-Bold 600, 1.5rem, line-height 1.25): Modal titles, major section headers (Emergency Incident Queue, Fleet Roster).
- **Title** (Semi-Bold 600, 1.125rem, line-height 1.35): Panel card headers, hospital facility names, incident category titles.
- **Body** (Regular 400, 0.875rem, line-height 1.5): Descriptive incident narratives, address strings, dialogue instructions.
- **Label** (Medium 500, 0.75rem, monospace, uppercase, letter-spacing 0.05em): Incident IDs (`EMG-20260930-4313`), fleet codes (`AMB-04`), OTPs, GPS coordinates, timestamps.

### Named Rules
**The Monospace Telemetry Rule.** Any piece of data that updates dynamically (GPS coords, ETAs, fuel percentages, clock timers, OTP digits) must render in `font-mono`.

## Layout

The spatial model employs an edge-to-edge modular grid optimized for desktop workstation viewports (1280px - 1920px+) with adaptive collapsible drawers for mobile operations.

- **Global Shell:** Persistent left-hand command sidebar (64px collapsed, 240px expanded) with real-time operational status header.
- **Content Area:** Fluid multi-column telemetry grid using 16px (`gap-4`) to 24px (`gap-6`) gutter spacing.
- **Information Density:** High information density. Table rows sit at 44px - 48px height with compact paddings (`px-3 py-2`).
- **Responsive Stacking:** On viewports < 1024px, split-screen map and list views collapse into tabbed switchers.

## Elevation & Depth

The design system is fundamentally flat-layered. Depth is communicated through calibrated tonal surfaces and razor-sharp border outlines rather than diffuse drop shadows.

### Shadow Vocabulary
- **Subtle Surface** (`box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.3)`): Grounded card rest state.
- **Hover Glow** (`box-shadow: 0 4px 12px 0 rgba(37, 99, 235, 0.15)`): Interactive focus on primary action cards.
- **Critical Alert Pulse** (`box-shadow: 0 0 16px 2px rgba(239, 68, 68, 0.25)`): Active unassigned high-severity emergency pulse.

### Named Rules
**The Tonal Layering Rule.** Depth is created by lightening container surfaces (`#0B0F19` background $\rightarrow$ `#131B2E` card $\rightarrow$ `#1B253D` hover state) paired with a 1px `#1F2E4D` border, never by stacked drop shadows.

## Shapes

- **Form Language:** Crisp technical rectangles with restrained corner smoothing.
- **Corner Radii:**
  - Micro (`rounded-sm` / 4px): Status badges, tag chips, input borders.
  - Standard (`rounded-md` / 8px): Buttons, selection rows, dropdowns.
  - Container (`rounded-lg` / 12px): Incident cards, telemetry panels, modal dialogs.
  - Full Pill (`rounded-full` / 9999px): Live indicator dots, counter bubbles, radar ping animations.
- **Borders:** Universal 1px solid border (`border border-[#1F2E4D]`) across all elevated surfaces.

## Components

### Buttons
- **Shape:** Gently rounded (8px radius, `rounded-md`).
- **Primary:** Cobalt background (`#2563EB`), crisp white text (`#F8FAFC`), font-medium (500), horizontal padding 16px, vertical padding 8px.
- **Hover / Focus:** Deep cobalt hover (`#1D4ED8`), 2px sky blue focus ring with 2px offset.
- **Danger / Alert:** Crimson background (`#EF4444`), hover `#DC2626`.
- **Secondary / Ghost:** Transparent background with `#1F2E4D` border, text `#F8FAFC`, hover `#1B253D`.

### Status Badges & Chips
- **Style:** Compact pill or rounded-sm tag with 1px border matching text hue with 10% alpha fill.
- **Available / Operational:** Emerald text (`#10B981`), background `rgba(16, 185, 129, 0.1)`, border `rgba(16, 185, 129, 0.2)`.
- **Busy / En Route:** Sky text (`#38BDF8`), background `rgba(56, 189, 248, 0.1)`, border `rgba(56, 189, 248, 0.2)`.
- **Critical / Emergency:** Crimson text (`#EF4444`), background `rgba(239, 68, 68, 0.1)`, border `rgba(239, 68, 68, 0.2)`.

### Cards / Containers
- **Corner Style:** 12px radius (`rounded-lg`).
- **Background:** `#131B2E`.
- **Border:** 1px solid `#1F2E4D`.
- **Internal Padding:** 16px (`p-4`) to 24px (`p-6`).

### Inputs / Search Fields
- **Style:** Background `#0B0F19`, 1px border `#1F2E4D`, text `#F8FAFC`, placeholder `#64748B`.
- **Focus:** 1px border `#2563EB` with subtle sky glow (`rgba(37, 99, 235, 0.2)`).

### Navigation
- **Sidebar Items:** Compact vertical stack, text-sm, 8px radius, text `#94A3B8`, icon 18px. Active item features `#2563EB` background with `#F8FAFC` text and left accent beacon.

## Do's and Don'ts

### Do:
- **Do** format all dates, timestamps, coordinates, and codes in `font-mono` (`JetBrains Mono`).
- **Do** maintain high contrast with a minimum 4.5:1 text-to-background ratio across all interactive controls.
- **Do** include explicit units (`km`, `mins`, `%`) alongside all telemetry numbers.
- **Do** keep card borders crisp (`#1F2E4D`) to preserve structural grid division on OLED and standard IPS monitors.

### Don't:
- **Don't** use decorative gradients, drop shadows, or frosted glassmorphism that impedes data readability during emergency operations.
- **Don't** hide critical incident telemetry (severity, patient status, address) behind multiple nested clicks.
- **Don't** use amber or red accents for non-urgent UI decor.
- **Don't** allow map overlays to obscure active vehicle dispatch controls.
