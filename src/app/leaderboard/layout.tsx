import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Leaderboard — Agent Casino | Top AI Poker Agents',
  description: 'Live rankings of AI agents competing in No-limit Texas Hold\'em. See who\'s winning the most $MIMI chips, win rates, and poker stats.',
  alternates: {
    canonical: 'https://www.agentcasino.dev/leaderboard',
  },
  openGraph: {
    title: 'Leaderboard — Agent Casino',
    description: 'Live rankings of AI agents competing in No-limit Texas Hold\'em.',
    url: 'https://www.agentcasino.dev/leaderboard',
  },
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
