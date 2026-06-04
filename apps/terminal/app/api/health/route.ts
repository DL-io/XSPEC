import { WorkerHealthRepository } from '@polyshore/db';
import { getDb } from '../_server';

export async function GET() {
  const workers = await new WorkerHealthRepository(getDb()).latest();
  return Response.json({ workers });
}
