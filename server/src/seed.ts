import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prisma } from "./db.js";

interface CatalogMovement {
  id: string;
  name: string;
  equipment: string;
  focus: string;
  instruction: string;
  easier: string;
  tracking: string;
  defaultReps: number;
  defaultSeconds: number;
  animationSrc?: string;
}

async function seedExerciseCatalog() {
  const catalogPath = pathToFileURL(resolve(process.cwd(), "src/data/workouts.js")).href;
  const catalog: { MOVEMENTS: CatalogMovement[] } = await import(catalogPath);
  for (const movement of catalog.MOVEMENTS) {
    await prisma.exercise.upsert({
      where: { id: movement.id },
      create: {
        id: movement.id,
        name: movement.name,
        equipment: movement.equipment,
        focus: movement.focus,
        instruction: movement.instruction,
        easier: movement.easier,
        tracking: movement.tracking,
        defaultReps: movement.defaultReps,
        defaultSeconds: movement.defaultSeconds,
        animationSrc: movement.animationSrc || "",
      },
      update: {
        name: movement.name,
        equipment: movement.equipment,
        focus: movement.focus,
        instruction: movement.instruction,
        easier: movement.easier,
        tracking: movement.tracking,
        defaultReps: movement.defaultReps,
        defaultSeconds: movement.defaultSeconds,
        animationSrc: movement.animationSrc || "",
      },
    });
  }
  console.info(`Seeded ${catalog.MOVEMENTS.length} exercise catalogue entries.`);
}

seedExerciseCatalog()
  .catch((error: unknown) => {
    console.error(`Exercise catalogue seed failed (${error instanceof Error ? error.name : "UnknownError"}).`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
