import { handle, jsonBody, requireStudent } from '@/lib/drills/http';
import { SettingsSchema, updateSettings } from '@/lib/drills/sets/service';

// Time accommodation (1×, 1.5×, 2×) and "Skip example" (PRD PUT /me/drill-settings).
export async function PUT(req: Request) {
  return handle(async () => updateSettings(await requireStudent(), SettingsSchema.parse(await jsonBody(req))));
}
