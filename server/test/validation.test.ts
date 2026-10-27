import { describe, expect, it } from "vitest";
import { dateKeyInTimeZone } from "../src/services/game.js";
import { mealSchema, registerSchema, workoutSchema } from "../src/validation.js";

describe("backend validation and domain helpers", () => {
  it("normalizes an account email and rejects bcrypt-incompatible UTF-8 passwords", () => {
    const valid = registerSchema.parse({
      name: " Runner ",
      email: " RUNNER@EXAMPLE.TEST ",
      password: "a-secure-password",
      goal: "Strength",
    });
    expect(valid.email).toBe("runner@example.test");
    expect(valid.name).toBe("Runner");

    expect(registerSchema.safeParse({
      name: "Runner",
      email: "runner@example.test",
      password: "é".repeat(37),
      goal: "Strength",
    }).success).toBe(false);
  });

  it("requires a performed set to contain repetitions or a timed duration, but not both", () => {
    const workout = {
      type: "Strength",
      name: "Squat session",
      duration: 30,
      date: "2026-01-05",
      performedSets: [{
        exerciseName: "Squat",
        setNumber: 1,
        reps: 8,
        restSeconds: 60,
      }],
    };
    expect(workoutSchema.safeParse(workout).success).toBe(true);
    expect(workoutSchema.safeParse({
      ...workout,
      performedSets: [{
        exerciseName: "Squat",
        setNumber: 1,
        reps: 8,
        durationSeconds: 30,
        restSeconds: 60,
      }],
    }).success).toBe(false);
  });

  it("applies meal defaults while rejecting invalid calendar dates", () => {
    const meal = mealSchema.parse({
      name: "Oats",
      type: "Breakfast",
      calories: 300,
      date: "2026-01-05",
    });
    expect(meal.quantity).toBe(1);
    expect(meal.quantityUnit).toBe("serving");
    expect(meal.nutritionEstimated).toBe(false);
    expect(mealSchema.safeParse({
      name: "Oats",
      type: "Breakfast",
      calories: 300,
      date: "2026-02-30",
    }).success).toBe(false);
  });

  it("derives activity dates in the user's configured time zone", () => {
    expect(dateKeyInTimeZone(new Date("2026-01-01T01:00:00.000Z"), "America/Los_Angeles"))
      .toBe("2025-12-31");
  });
});
