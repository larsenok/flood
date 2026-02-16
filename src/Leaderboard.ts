export interface LeaderboardEntry {
  id: number;
  nickname: string;
  level_date: string;
  score: number;
  flooded_pct: number;
  bags_used: number;
  wall_budget: number;
  dry_land: number;
  flooded_tiles: number;
  total_tiles: number;
  time_spent_ms: number;
  created_at: string;
}

export interface ScoreSubmission {
  nickname: string;
  level_date: string;
  score: number;
  flooded_pct: number;
  bags_used: number;
  wall_budget: number;
  dry_land: number;
  flooded_tiles: number;
  total_tiles: number;
  time_spent_ms: number;
}

function getSupabaseConfig(): { url: string; anonKey: string } {
  const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase env vars missing: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  }
  return { url, anonKey };
}

export async function submitScore(payload: ScoreSubmission): Promise<void> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/flood_leaderboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Score submit failed (${response.status}): ${details}`);
  }
}

export async function fetchLeaderboard(limit = 25): Promise<LeaderboardEntry[]> {
  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/flood_leaderboard?select=id,nickname,level_date,score,flooded_pct,bags_used,wall_budget,dry_land,flooded_tiles,total_tiles,time_spent_ms,created_at&order=score.desc,time_spent_ms.asc,created_at.asc&limit=${limit}`,
    {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Leaderboard fetch failed (${response.status}): ${details}`);
  }

  return (await response.json()) as LeaderboardEntry[];
}
