#!/bin/bash
# Script to verify and complete the docs reorganization

cd ../../

# List the current structure
echo "Current document directories:"
find docs -type d | sort

echo "Files still in the root docs directory:"
ls -la docs/*.md

# Clean and move operations properly
echo "Moving remaining files to their proper locations..."

# Architecture files
mkdir -p docs/architecture
mv -v docs/containerization-strategy.md docs/architecture/ 2>/dev/null
mv -v docs/integration-plan.md docs/architecture/integration-architecture.md 2>/dev/null

# Development files
mkdir -p docs/development
mkdir -p docs/development/mvp-specs
mkdir -p docs/development/phase-plans
mv -v docs/development-roadmap.md docs/development/ 2>/dev/null
mv -v docs/backend-mvp.md docs/development/mvp-specs/ 2>/dev/null
mv -v docs/frontend-mvp.md docs/development/mvp-specs/ 2>/dev/null
mv -v docs/integration-implementation.md docs/development/phase-plans/phase3-implementation.md 2>/dev/null

# Feature files
mkdir -p docs/features/tour-generation
mv -v docs/country-data-flow-implementation.md docs/features/tour-generation/ 2>/dev/null
mv -v docs/country-data-implementation-plan.md docs/features/tour-generation/ 2>/dev/null
mv -v docs/tour-duration-feature.md docs/features/tour-generation/ 2>/dev/null

# Operations files
mkdir -p docs/operations
mv -v docs/container-management.md docs/operations/ 2>/dev/null

# Technical notes
mkdir -p docs/technical-notes
mv -v docs/network-connectivity-fixes.md docs/technical-notes/ 2>/dev/null
mv -v docs/api-path-fix.md docs/technical-notes/ 2>/dev/null

echo "Move completed. Checking final structure:"
find docs -type f -name "*.md" | sort