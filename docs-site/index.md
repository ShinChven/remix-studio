---
layout: home

hero:
  name: Remix Studio 2.0
  text: Multi-agent AI studio & batch campaign workspace
  tagline: A self-hosted Material 3 Expressive workspace powered by a Multi-Agent Assistant, interactive MCP Apps, reusable workflow libraries, and social campaign automation.
  image:
    light: /Screenshot-light.jpg
    dark: /Screenshot-dark.jpg
    alt: Remix Studio 2.0
  actions:
    - theme: brand
      text: What's New in 2.0
      link: /whats-new
    - theme: alt
      text: Get Started
      link: /guide/local-development
    - theme: alt
      text: View on GitHub
      link: https://github.com/ShinChven/remix-studio

features:
  - icon: 🤖
    title: Multi-Agent Assistant
    details: Run single-agent turns or /agents swarms with coordinator and parallel specialist workers, a shared blackboard, interactive architecture graph, step tracker, web search grounding, and generation batch auto-resume.
    link: /concepts/assistant
    linkText: Explore the assistant
  - icon: 🪟
    title: Interactive MCP Apps
    details: Five sandboxed ui:// views — media grid, queue monitor, post preview, project overview, and live generation batch tracker — render inline both in the built-in assistant and in compliant MCP clients.
    link: /integrations/mcp
    linkText: MCP & MCP Apps
  - icon: 🎨
    title: Material 3 Expressive UI
    details: Totally rebuilt single interface at / with dynamic tonal palettes from a seed color or uploaded image, expressive motion springs, virtualized job lists, and Cmd/Ctrl+K search with @ settings jump.
    link: /guide/introduction
    linkText: Tour the studio
  - icon: 🧩
    title: Combination Engine
    details: Build workflows from reusable libraries and direct inputs, then expand them into full combination sweeps or randomized shuffle samples — 3 subjects × 4 styles × 2 references becomes 24 drafts before you send anything.
    link: /concepts/workflows
    linkText: How workflows work
  - icon: 📚
    title: Reusable Libraries
    details: Store prompt fragments, tags, and media inputs in text, image, video, and audio libraries — plus dedicated assistant skills — and reuse them across every project, campaign, and agent turn.
    link: /concepts/libraries
    linkText: Libraries & prompts
  - icon: 📅
    title: Campaign Workspace
    details: Turn generated copy and media into campaign posts, schedule them on a timeline, and publish across connected social channels like X and Threads.
    link: /concepts/campaigns
    linkText: Plan campaigns
  - icon: 🖥️
    title: ComfyUI & Civitai
    details: Batch an API-format ComfyUI workflow on a GPU you host, or generate images and Wan or Hunyuan videos with any checkpoint and LoRA on Civitai — every input combines and shuffles like a regular workflow step.
    link: /concepts/projects#comfyui-projects
    linkText: Project types
  - icon: 📺
    title: Albums on Your TV
    details: Browse albums on the living-room TV with a remote-friendly viewer, in Finder or Explorer over WebDAV, or in a TV's own media app over DLNA — read-only, per device.
    link: /integrations/tv-and-devices
    linkText: TV, WebDAV & DLNA
  - icon: 🏠
    title: Self-Hosted Control
    details: Providers, storage, exports, auth, and automation all stay in your own deployment — backed by PostgreSQL, S3-compatible storage, and Docker.
    link: /guide/docker-deployment
    linkText: Deploy it
---

## Multimodal by design

Remix Studio 2.0 runs text, image, video, and audio generation projects — plus ComfyUI workflows you host and Civitai models — from one Material 3 Expressive workspace. It combines four layers in one product:

- A **Multi-Agent Assistant** with `/agents` swarms, inline **MCP Apps**, step tracking, web search, and batch auto-resume
- A **project system** for composing workflows from library-backed and direct inputs
- A **campaign workspace** for scheduling and publishing social posts
- A **background execution stack** for queueing, batch tracking, storing, exporting, and delivering results

Available in English, Simplified Chinese, Traditional Chinese, Japanese, Korean, and French.

> Built with **Google AI Studio** and **Antigravity**.

## Found a bug or have a request?

Please report it on [GitHub Issues](https://github.com/ShinChven/remix-studio/issues). Bug reports, feature requests, and questions are all welcome — clear reports with steps to reproduce help the most.
