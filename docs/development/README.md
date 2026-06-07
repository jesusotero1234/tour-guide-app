# Development Documentation

This directory contains documentation related to the development process and roadmap of the Tour Guide App.

## Contents

- [Local Development](./local-dev.md) - Start/stop the full local MVP stack
- [Development Roadmap](./development-roadmap.md) - Overall development timeline and plans
- [MVP Specifications](./mvp-specs/) - Minimum viable product requirements
- [Phase Plans](./phase-plans/) - Detailed implementation plans for each phase

## Development Phases

| Phase | Status      | Description                                      |
|-------|------------|--------------------------------------------------|
| 1     | ✅ Complete | Core Functionality Enhancement                   |
| 2     | ✅ Complete | Content Enrichment (Description, TTS, Supabase)  |
| 3     | ✅ Complete | End-to-End Integration                           |
| 4     | 🔄 Planned  | System Intelligence (Smart Routing & Feedback)   |

## Current Development Focus

We've completed Phase 3 of development which focused on end-to-end integration of all components. Recent improvements include:

- Enhanced narrative quality with conversational descriptions
- Position-aware tour structure (welcome, transitions, conclusion)
- Fixed TTS compatibility with narrative text

Next steps will be Phase 4 focusing on improving system intelligence with:

- LLM-Verification feedback loop
- Advanced route optimization
- Context-aware place suggestions

## Key Technical Decisions

- TypeScript for all components
- Node.js for backend and microservices
- Next.js for frontend
- Docker for containerization
- OpenAI/Claude for LLM services
- Supabase for data persistence
