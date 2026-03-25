-- Enable pgvector
create extension if not exists vector;

-- Note chunks table for RAG
create table if not exists note_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  note_id uuid,
  course_id text,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- IVFFlat index for fast cosine similarity search
create index if not exists note_chunks_embedding_idx 
  on note_chunks using ivfflat (embedding vector_cosine_ops) 
  with (lists = 100);

-- RLS
alter table note_chunks enable row level security;
create policy "Users see own chunks" on note_chunks
  for all using (user_id = auth.uid());

-- Semantic search function
create or replace function semantic_search(
  query_embedding vector(1536),
  match_user_id uuid,
  match_course_id text default null,
  match_count int default 10,
  match_threshold float default 0.7
)
returns table (
  id uuid,
  note_id uuid,
  course_id text,
  chunk_index int,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    nc.id, nc.note_id, nc.course_id, nc.chunk_index, nc.content, nc.metadata,
    1 - (nc.embedding <=> query_embedding) as similarity
  from note_chunks nc
  where nc.user_id = match_user_id
    and (match_course_id is null or nc.course_id = match_course_id)
    and 1 - (nc.embedding <=> query_embedding) > match_threshold
  order by nc.embedding <=> query_embedding
  limit match_count;
$$;
