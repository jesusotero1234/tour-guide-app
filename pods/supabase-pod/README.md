# Supabase Integration Pod - Implementation Guide

This document outlines the step-by-step process for implementing the Supabase Integration Pod for the Tour Guide App (Phase 2, Task 4 in the development roadmap).

Overview
The Supabase Integration Pod will provide:

Database persistence for tours and places
Cloud storage for audio files
Authentication and authorization
API endpoints for CRUD operations
Implementation Phases
Phase 1: Supabase Project Setup ✅
Create Supabase Project ✅

[x] Sign up/login to Supabase Dashboard
[x] Create a new project
[x] Choose a region close to your target audience (EU Central)
[x] Note the project reference ID and password for configuration
Gather API Credentials ✅

[x] Go to Project Settings → API
[x] Copy the anon public key and service_role key
[x] Generate a personal access token from Account → Access Tokens
[x] Store all credentials securely in environment variables or .env file
Phase 2: Database Schema Creation ✅
Create Tours Table ✅

CREATE TABLE tours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city TEXT NOT NULL,
  theme TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en-us',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID, -- For future authentication
  metadata JSONB -- For extensibility
);
Create Places Table ✅

CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tour_id UUID REFERENCES tours(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  position INTEGER NOT NULL, -- Order in the tour
  importance_score FLOAT, -- From verification pod
  CONSTRAINT fk_tour FOREIGN KEY (tour_id) REFERENCES tours(id)
);
Create Audio Files Table ✅

CREATE TABLE audio_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  format TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB, -- For extensibility
  CONSTRAINT fk_place FOREIGN KEY (place_id) REFERENCES places(id)
);
Create Database Indexes ✅

-- For querying tours by city and theme
CREATE INDEX idx_tours_city_theme ON tours(city, theme);

-- For retrieving places in a tour
CREATE INDEX idx_places_tour_id ON places(tour_id);

-- For retrieving audio files by place
CREATE INDEX idx_audio_place_id ON audio_files(place_id);
Phase 3: Storage Bucket Configuration
Create Audio Storage Bucket

[ ] Go to Storage → Create a new bucket
[ ] Name: tour-guide-audio
[ ] Set bucket to Public (for easy audio access)
Configure CORS Settings

[ ] Add CORS policy to allow web client access:
{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["GET"],
  "AllowedOrigins": ["*"],
  "ExposeHeaders": [],
  "MaxAgeSeconds": 3000
}
Plan Storage Structure

[ ] Define folder structure: [tour_id]/[place_id]_[language].[format]
[ ] Example: 550e8400-e29b-41d4-a716-446655440000/a1b2c3d4_en-us.mp3
Phase 4: Access Policies Configuration ✅
Enable Row Level Security ✅

-- Enable RLS on all tables
ALTER TABLE tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_files ENABLE ROW LEVEL SECURITY;
Create Public Access Policies ✅

-- Public read access to all tours
CREATE POLICY "Anyone can read tours" ON tours
  FOR SELECT USING (true);
  
-- Public read access to all places
CREATE POLICY "Anyone can read places" ON places
  FOR SELECT USING (true);
  
-- Public read access to all audio files
CREATE POLICY "Anyone can read audio files" ON audio_files
  FOR SELECT USING (true);
Create Service Role Policies ✅ (for backend/pod use)

-- Service role can do everything
CREATE POLICY "Service role can manage tours" ON tours
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
  
CREATE POLICY "Service role can manage places" ON places
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
  
CREATE POLICY "Service role can manage audio files" ON audio_files
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
Phase 5: Pod Development - Basic Setup
Create Project Structure

[ ] Initialize package.json with npm init
[ ] Install dependencies:
npm install express @supabase/supabase-js dotenv cors helmet
npm install --save-dev typescript ts-node nodemon @types/express @types/cors @types/node
[ ] Setup TypeScript configuration (tsconfig.json)
[ ] Create basic folder structure:
/src
  /config
  /routes
  /services
  /types
  /middleware
  /utils
  server.ts
Configure Environment Variables

[ ] Create .env.example file with the following:
PORT=3006
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
[ ] Create actual .env file with your values
[ ] Setup env.ts file to load these variables
Phase 6: Pod Development - Core Services
Create Supabase Client Service

// src/services/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env';

const supabaseUrl = config.SUPABASE_URL;
const supabaseKey = config.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
Create Tour Service

[ ] Implement functions for creating, retrieving, updating, and deleting tours
[ ] Include logic for filtering tours by city or theme
Create Place Service

[ ] Implement functions for managing places within tours
[ ] Include logic for ordering places in a tour
Create Audio Service

[ ] Implement functions for uploading and retrieving audio files
[ ] Include caching mechanisms for frequently accessed files
Phase 7: Pod Development - API Endpoints
Create Tours Endpoints

// src/routes/tours.ts
import { Router } from 'express';
import { tourService } from '../services/tourService';

const router = Router();

router.post('/', tourService.createTour);
router.get('/', tourService.listTours);
router.get('/:id', tourService.getTourById);
router.put('/:id', tourService.updateTour);
router.delete('/:id', tourService.deleteTour);

export default router;
Create Places Endpoints

[ ] Implement GET, POST, PUT, DELETE endpoints for places
[ ] Include validation middleware
Create Audio Endpoints

[ ] Implement endpoints for audio file upload and retrieval
[ ] Include format conversion if needed
Setup Server and Routes

// src/server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import tourRoutes from './routes/tours';
import placeRoutes from './routes/places';
import audioRoutes from './routes/audio';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.use('/tours', tourRoutes);
app.use('/places', placeRoutes);
app.use('/audio', audioRoutes);

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
  console.log(`Supabase Integration Pod running on port ${PORT}`);
});
Phase 8: Testing and Documentation
Create Test Suite

[ ] Unit tests for services
[ ] Integration tests for APIs
[ ] Mock Supabase for testing
Create API Documentation

[ ] Document all endpoints with examples
[ ] Include authentication requirements
[ ] Document error responses
Usage Examples

[ ] Provide example requests and responses
[ ] Include curl examples
Phase 9: Deployment and Integration
Create Deployment Scripts

[ ] Create Containerfile/Dockerfile
[ ] Update compose.yml to include supabase-pod
[ ] Add deployment script to scripts directory
Update Backend API

[ ] Add routes to proxy requests to Supabase pod
[ ] Update tour creation flow to persist data
Integrate with Frontend

[ ] Update frontend to fetch and display saved tours
[ ] Add user authentication if implemented
Success Criteria
[x] Tours and places are successfully stored in Supabase
[ ] Audio files are properly stored and retrievable
[x] Response times are under 200ms for data operations
[ ] Storage operations complete in under 2 seconds
Connection Information
Database Connection
Host: aws-0-eu-central-1.pooler.supabase.com
Port: 6543
Database: postgres
User: postgres.npauruzzzidwnubilynn
Environment Variables Required
SUPABASE_PROJECT_REF=npauruzzzidwnubilynn
SUPABASE_REGION=eu-central-1
SUPABASE_DB_PASSWORD=<your-db-password>
SUPABASE_ACCESS_TOKEN=<your-access-token>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
Resources
Supabase Documentation
Supabase JavaScript Client
PostgreSQL Documentation
Express.js Documentation 