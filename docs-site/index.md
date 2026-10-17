---
layout: home

hero:
  name: Remix Studio
  text: Batch AI generation & campaign workspace
  tagline: A self-hosted AI assistant workspace for orchestration, batch content generation, and social campaign planning — powered by a built-in assistant and reusable workflow libraries.
  image:
    src: /screenshot.jpg
    alt: Remix Studio
  actions:
    - theme: brand
      text: What Is Remix Studio
      link: /guide/introduction
    - theme: alt
      text: Get Started
      link: /guide/local-development
    - theme: alt
      text: View on GitHub
      link: https://github.com/ShinChven/remix-studio

features:
  - icon: 🧩
    title: Combination Engine
    details: Build workflows from reusable libraries and direct inputs, then expand them into full combination sweeps or randomized shuffle samples — 3 subjects × 4 styles × 2 references becomes 24 drafts before you send anything.
    link: /concepts/workflows
    linkText: How workflows work
  - icon: 🤖
    title: Assistant-First Orchestration
    details: A built-in assistant, running on your own OpenAI, Claude, Google AI, Alibaba Cloud, Kimi or MiniMax provider, can inspect libraries, albums, model availability, and storage, then prepare project mutations behind explicit confirmation.
    link: /concepts/assistant
    linkText: Learn more
  - icon: 📚
    title: Reusable Libraries
    details: Store prompt fragments, tags, and media inputs in text, image, video, and audio libraries — then reuse them across every project and workflow.
    link: /concepts/libraries
    linkText: Libraries & prompts
  - icon: 📅
    title: Campaign Workspace
    details: Turn generated copy and media into campaign posts, schedule them on a timeline, and publish across connected social channels like X and Threads.
    link: /concepts/campaigns
    linkText: Plan campaigns
  - icon: 🔌
    title: MCP Support
    details: The same shared tool layer powers an MCP server at /mcp, so clients like Claude and Codex can create libraries, inspect albums and models, and assemble projects.
    link: /integrations/mcp
    linkText: MCP integration
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

Remix Studio runs text, image, video, and audio generation projects — plus ComfyUI workflows you host and Civitai models — from one workspace. It combines four layers in one product:

- An **in-app assistant** for planning and operating workflows
- A **project system** for composing workflows from library-backed and direct inputs
- A **campaign workspace** for scheduling and publishing social posts
- A **background execution stack** for queueing, storing, exporting, and delivering results

Available in English, Simplified Chinese, Traditional Chinese, Japanese, Korean, and French.

> Built with **Google AI Studio** and **Antigravity**.

## Found a bug or have a request?

Please report it on [GitHub Issues](https://github.com/ShinChven/remix-studio/issues). Bug reports, feature requests, and questions are all welcome — clear reports with steps to reproduce help the most.
