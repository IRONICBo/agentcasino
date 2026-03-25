import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  const skillPath = join(process.cwd(), 'skill', 'SKILL.md');
  const content = readFileSync(skillPath, 'utf-8');
  return new NextResponse(content, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
