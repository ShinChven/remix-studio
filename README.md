# 🎨 Remix Studio

> Where imagination meets the machine. A unified workspace for high-performance AI image orchestration.

---

## 🎯 The Vision

A single prompt is rarely a final masterpiece. **Remix Studio** is built for the iterative process that defines professional AI content creation. Instead of a limited "one-off" chat interface, we provide a high-octane production environment where **remixing** your vision across multiple models is the core workflow.

Tweak parameters, swap engines, and watch a single idea evolve into a production-ready batch of content. Whether you are generating 50-image conceptual albums or stress-testing a prompt across **nano banana 2** (Gemini/Vertex/RunningHub) and **GPT Image 1.5** (OpenAI) simultaneously, Remix Studio orchestrates the background complexity. From prompt to album, and from album to high-speed ZIP export—this is where your ideas scale.

---

## ✨ Highlights

- 🚀 **Multi-Provider Engine**: Seamlessly toggle between **GoogleAI**, **VertexAI**, **RunningHub**, and **OpenAI**. One interface, every model.
- 🔄 **Advanced Workflows**: Beyond text-to-image. Support for image-to-image remixing with **nano banana 2** and **GPT Image 1.5**, aspect ratio control, and multi-step generation pipelines.
- ⚡ **High-Performance Storage**: Cloud-native architecture utilizing S3/MinIO with pre-signed URL security and `sharp`-powered image optimization.
- 📦 **Bulk Export System**: A robust background queue manager for generating entire albums and exporting them as optimized ZIP archives.
- 🛡️ **Clean & Secure**: Decoupled admin architecture, JWT-based authentication, and strict user-isolated storage quotas.
- 🧪 **Modern Tech Stack**: Built for the future with **React 19**, **Hono**, **Prisma**, and **Tailwind CSS 4**.

---

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [Tailwind CSS 4](https://tailwindcss.com/)
- **Server**: [Hono](https://hono.dev/) (Edge-ready Node.js framework)
- **Database**: [Prisma](https://www.prisma.io/) with PostgreSQL support
- **Storage**: [AWS SDK](https://aws.amazon.com/sdk-for-javascript/) (S3/MinIO compatible)
- **Processing**: [Sharp](https://sharp.pixelplumbing.com/) (High-performance image transformation)

---

## 🌍 Deployment Flexibility

Remix Studio is architected to scale from a developer's laptop to a production-grade cloud environment.

- **Local-First**: Develop and iterate locally with zero-cost overhead using Node.js and MinIO. A `docker-compose.yml` is included to spin up a full local environment in seconds.
- **Cloud-Ready**: Fully compatible with enterprise-grade infrastructure, including AWS S3 and PostgreSQL. Its stateless server design is optimized for containerization and high-availability deployments.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Docker](https://www.docker.com/) (recommended for local infrastructure)
- API keys for your preferred providers (**nano banana 2** on Gemini, OpenAI, etc.)

### 🐳 Local Infrastructure (Docker)

Spin up your local PostgreSQL and MinIO environment with one command:
```bash
docker-compose up -d
```
This will initialize your database on port `5432` and MinIO on port `19000` (API) and `19001` (Console).

### 🛠️ App Installation

1. **Clone and Install**
   ```bash
   git clone https://github.com/your-repo/remix-studio.git
   cd remix-studio
   npm install
   ```

2. **Environment Setup**
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

3. **Database Migration**
   Apply the schema to your PostgreSQL instance:
   ```bash
   npx prisma migrate dev
   ```

4. **Launch the Studio**
   ```bash
   npm run dev
   ```
   The studio will be live at `http://localhost:3000`.

---

## ⚖️ License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).

---

<div align="center">
  Built with ❤️ for the AI creative community.
</div>
