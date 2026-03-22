"""
InsForge Database Schema Setup

Run this AFTER connecting your InsForge project.
Or paste the AGENT_PROMPT into Cursor/Claude Code and let your agent create the tables.

Usage:
    python setup_insforge.py
"""

AGENT_PROMPT = """
I'm using InsForge as my backend platform. Create these database tables:

1. `learners` — id (uuid PK), email (text unique), display_name (text), 
   skill_level (text: beginner/intermediate/advanced), total_practice_minutes (int default 0), 
   current_streak_days (int default 0), created_at (timestamptz), updated_at (timestamptz)

2. `skill_nodes` — id (text), learner_id (uuid FK→learners), name (text), 
   category (text: scales/chords/rhythm/technique/reading/theory), mastery (real 0-1), 
   last_practiced (timestamptz), total_attempts (int default 0). PK: (id, learner_id)

3. `songs` — id (uuid PK), title (text), artist (text), difficulty (int 1-10), 
   bpm (int), midi_file_url (text nullable), note_count (int), duration_ms (int), 
   tags (text[]), source (text: builtin/crawled/uploaded), created_at (timestamptz)

4. `practice_sessions` — id (uuid PK), learner_id (uuid FK→learners), 
   song_id (uuid FK→songs nullable), mode (text: guided/freeplay/jam/boss/ear), 
   started_at (timestamptz), ended_at (timestamptz nullable), duration_seconds (int), 
   accuracy (real), avg_timing_ms (real), best_streak (int), total_notes (int), 
   notes_hit (int), score (int), grade (text: S/A/B/C/D), coach_feedback (text nullable)

5. `spaced_repetition` — id (uuid PK), learner_id (uuid FK→learners), 
   item_type (text: song/skill/section), item_id (text), ease_factor (real default 2.5), 
   interval_days (real default 1), repetitions (int default 0), 
   next_review (timestamptz), last_quality (int 0-5). UNIQUE: (learner_id, item_type, item_id)

Also set up:
- Google OAuth authentication
- Storage bucket 'midi-files' for MIDI uploads
- Storage bucket 'recordings' for practice recordings
- Enable realtime on practice_sessions table
"""

SQL_SCHEMA = """
CREATE TABLE IF NOT EXISTS learners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  skill_level TEXT DEFAULT 'beginner',
  total_practice_minutes INTEGER DEFAULT 0,
  current_streak_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skill_nodes (
  id TEXT NOT NULL,
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  mastery REAL DEFAULT 0,
  last_practiced TIMESTAMPTZ,
  total_attempts INTEGER DEFAULT 0,
  PRIMARY KEY (id, learner_id)
);

CREATE TABLE IF NOT EXISTS songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 10),
  bpm INTEGER,
  midi_file_url TEXT,
  note_count INTEGER,
  duration_ms INTEGER,
  tags TEXT[],
  source TEXT DEFAULT 'builtin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  song_id UUID REFERENCES songs(id),
  mode TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  accuracy REAL,
  avg_timing_ms REAL,
  best_streak INTEGER,
  total_notes INTEGER,
  notes_hit INTEGER,
  score INTEGER,
  grade TEXT,
  coach_feedback TEXT
);

CREATE TABLE IF NOT EXISTS spaced_repetition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  ease_factor REAL DEFAULT 2.5,
  interval_days REAL DEFAULT 1,
  repetitions INTEGER DEFAULT 0,
  next_review TIMESTAMPTZ DEFAULT NOW(),
  last_quality INTEGER,
  UNIQUE (learner_id, item_type, item_id)
);

CREATE INDEX idx_sessions_learner ON practice_sessions(learner_id, started_at DESC);
CREATE INDEX idx_skills_learner ON skill_nodes(learner_id);
CREATE INDEX idx_spaced_review ON spaced_repetition(learner_id, next_review);
"""

if __name__ == "__main__":
    print("=" * 60)
    print("  KeyFlow — InsForge Schema Setup")
    print("=" * 60)
    print()
    print("Option 1: Paste this into Cursor/Claude Code:")
    print("-" * 60)
    print(AGENT_PROMPT)
    print("-" * 60)
    print()
    print("Option 2: Run the SQL directly against your Postgres:")
    print("-" * 60)
    print(SQL_SCHEMA)
    print("-" * 60)
