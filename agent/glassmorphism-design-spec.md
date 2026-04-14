# Glassmorphism Design Specification

This document defines the standard design language for the "Glassmorphism" aesthetic across the application. These rules ensure visual consistency and a premium, state-of-the-art feel.

## 1. Core Principles

- **Transparency**: Never use 100% opaque backgrounds for primary containers. Use semi-transparent white/black.
- **Blur**: Always use `backdrop-blur` to ensure readability of text over complex background gradients.
- **Borders**: Use low-opacity borders to define edges without adding visual weight.
- **Layering**: Use different opacity levels to create a sense of depth (Elevation).

## 2. Standard Container Styles

The following Tailwind CSS configurations are the approved standards for the application.

### 2.1 Primary Glass Card (The "MCP Standard")
This is the baseline for large content blocks, sections, and feature cards (inspired by the MCP Connections "Connect AI App" card).

- **Tailwind Classes**: 
  `rounded-xl border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl shadow-sm`
- **Usage**: Main sections, Dashboard cards, and primary content containers.

### 2.2 Secondary Glass Card (High Readability)
Use this for nested items, list items, or areas where text legibility is the highest priority.

- **Tailwind Classes**: 
  `bg-white/70 dark:bg-neutral-900/70 border border-neutral-200/50 dark:border-white/5 backdrop-blur-xl shadow-sm`
- **Usage**: Item metadata containers, detailed property cards, and side panels.

### 2.3 Header & Navigation Glass
Used for sticky headers and navigation bars.

- **Tailwind Classes**: 
  `bg-white/40 dark:bg-black/40 backdrop-blur-3xl border-b border-neutral-200/50 dark:border-white/5 shadow-sm`
- **Usage**: Page headers, Tab bars, and Sticky toolbars.

### 2.4 Glass Chips & Badges
Compact elements for metadata and status.

- **Tailwind Classes**:
  `bg-white/50 dark:bg-neutral-900/50 border border-neutral-200/50 dark:border-white/5 rounded backdrop-blur-md`
- **Usage**: Tags, Version badges, and Status indicators.

## 3. Corner Radii Standards

- **Small elements (Chips, Badges)**: `rounded` or `rounded-md` (4px - 6px).
- **UI Controls (Buttons, Inputs)**: `rounded-xl` (12px).
- **Secondary Containers (List items)**: `rounded-xl` (12px).
- **Primary Containers (Cards, Sections)**: `rounded-2xl` (16px).

## 4. Visual Contrast Guidelines

- **Light Mode**: Prefer `white/40` or `white/70`. Borders should use `neutral-200/50`.
- **Dark Mode**: Prefer `neutral-900/40` or `black/40`. Borders should use `white/5` or `neutral-800/50` for subtle definition.
- **Shadows**: Use soft, large shadows like `shadow-lg shadow-black/5` to ground the glass elements.

---
*Last Updated: 2026-04-14*
