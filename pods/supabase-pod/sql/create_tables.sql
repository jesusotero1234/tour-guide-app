-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tours table
CREATE TABLE IF NOT EXISTS tours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city TEXT NOT NULL,
  country TEXT,
  country_code TEXT,
  theme TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en-us',
  duration_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID,
  metadata JSONB
);

-- Create places table
CREATE TABLE IF NOT EXISTS places (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tour_id UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  position INTEGER NOT NULL,
  importance_score FLOAT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_tour FOREIGN KEY (tour_id) REFERENCES tours(id)
);

-- Create audio_files table
CREATE TABLE IF NOT EXISTS audio_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  format TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB,
  CONSTRAINT fk_place FOREIGN KEY (place_id) REFERENCES places(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tours_city_theme ON tours(city, theme);
CREATE INDEX IF NOT EXISTS idx_places_tour_id ON places(tour_id);
CREATE INDEX IF NOT EXISTS idx_audio_place_id ON audio_files(place_id);
