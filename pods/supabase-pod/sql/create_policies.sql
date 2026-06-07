-- Enable Row Level Security on all tables
ALTER TABLE tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_files ENABLE ROW LEVEL SECURITY;

-- Public read access policies
-- Anyone can read tours
CREATE POLICY "Anyone can read tours" 
  ON tours
  FOR SELECT 
  USING (true);

-- Anyone can read places
CREATE POLICY "Anyone can read places" 
  ON places
  FOR SELECT 
  USING (true);

-- Anyone can read audio files
CREATE POLICY "Anyone can read audio files" 
  ON audio_files
  FOR SELECT 
  USING (true);

-- Service role policies (for authenticated backend use)
-- Service role can manage tours
CREATE POLICY "Service role can manage tours" 
  ON tours
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Service role can manage places
CREATE POLICY "Service role can manage places" 
  ON places
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Service role can manage audio files
CREATE POLICY "Service role can manage audio files" 
  ON audio_files
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Future enhancement: add user-specific policies when authentication is implemented
-- For example:
-- CREATE POLICY "Users can manage their own tours"
--   ON tours
--   USING (auth.uid() = user_id)
--   WITH CHECK (auth.uid() = user_id);
