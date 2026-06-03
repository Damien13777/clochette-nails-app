import { db } from "../db";

export async function setMaintenance(on: boolean): Promise<void> {
  await db.platformSettings.updateMany({ data: { maintenanceMode: on } });
}
