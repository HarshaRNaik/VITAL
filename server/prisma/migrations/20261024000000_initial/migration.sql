-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AssistantRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "LegacyImport" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workoutCount" INTEGER NOT NULL DEFAULT 0,
    "mealCount" INTEGER NOT NULL DEFAULT 0,
    "metricCount" INTEGER NOT NULL DEFAULT 0,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitnessGoal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "metric" VARCHAR(40) NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "unit" VARCHAR(40) NOT NULL,
    "deadline" DATE,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitnessGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "goal" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "theme" VARCHAR(20) NOT NULL DEFAULT 'dark',
    "measurementUnit" VARCHAR(20) NOT NULL DEFAULT 'metric',
    "timeZone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    "workoutPreference" VARCHAR(500) NOT NULL DEFAULT '',
    "emailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "customPlanId" UUID,
    "type" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "duration" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "calories" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "caloriesEstimated" BOOLEAN NOT NULL DEFAULT false,
    "date" DATE NOT NULL,
    "planId" VARCHAR(100),
    "planCategory" VARCHAR(100),
    "courseSession" VARCHAR(100),
    "plannedDurationMinutes" INTEGER,
    "exercisesCompleted" INTEGER,
    "setsCompleted" INTEGER,
    "sessionId" VARCHAR(100),
    "clientRequestId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSet" (
    "id" UUID NOT NULL,
    "workoutId" UUID NOT NULL,
    "exerciseId" VARCHAR(100),
    "exerciseSequence" INTEGER,
    "exerciseName" VARCHAR(120) NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "reps" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "durationSeconds" INTEGER,
    "restSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "quantityUnit" VARCHAR(40) NOT NULL DEFAULT 'serving',
    "calories" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nutritionEstimated" BOOLEAN NOT NULL DEFAULT false,
    "date" DATE NOT NULL,
    "clientRequestId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressMetric" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "clientRequestId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameState" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "totalXP" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastActive" DATE,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameReward" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(160) NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "equipment" VARCHAR(80) NOT NULL,
    "focus" VARCHAR(120) NOT NULL,
    "instruction" VARCHAR(1000) NOT NULL,
    "easier" VARCHAR(500) NOT NULL,
    "tracking" VARCHAR(20) NOT NULL,
    "defaultReps" INTEGER NOT NULL,
    "defaultSeconds" INTEGER NOT NULL,
    "animationSrc" VARCHAR(500) NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutPlan" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL DEFAULT '',
    "category" VARCHAR(100) NOT NULL,
    "difficulty" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutPlanExercise" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "exerciseId" VARCHAR(100) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" INTEGER,
    "durationSeconds" INTEGER,
    "restSeconds" INTEGER NOT NULL,

    CONSTRAINT "WorkoutPlanExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "clientRequestId" VARCHAR(100),
    "role" "AssistantRole" NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAuditEvent" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "targetType" VARCHAR(80) NOT NULL,
    "targetId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegacyImport_userId_key" ON "LegacyImport"("userId");

-- CreateIndex
CREATE INDEX "FitnessGoal_userId_completedAt_deadline_idx" ON "FitnessGoal"("userId", "completedAt", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "Workout_userId_date_idx" ON "Workout"("userId", "date" DESC);

-- CreateIndex
CREATE INDEX "Workout_userId_type_date_idx" ON "Workout"("userId", "type", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Workout_userId_sessionId_key" ON "Workout"("userId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Workout_userId_clientRequestId_key" ON "Workout"("userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "WorkoutSet_workoutId_idx" ON "WorkoutSet"("workoutId");

-- CreateIndex
CREATE INDEX "WorkoutSet_exerciseId_idx" ON "WorkoutSet"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutSet_workoutId_exerciseSequence_setNumber_key" ON "WorkoutSet"("workoutId", "exerciseSequence", "setNumber");

-- CreateIndex
CREATE INDEX "Meal_userId_date_idx" ON "Meal"("userId", "date" DESC);

-- CreateIndex
CREATE INDEX "Meal_userId_type_date_idx" ON "Meal"("userId", "type", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Meal_userId_clientRequestId_key" ON "Meal"("userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "ProgressMetric_userId_date_idx" ON "ProgressMetric"("userId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ProgressMetric_userId_clientRequestId_key" ON "ProgressMetric"("userId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "GameState_userId_key" ON "GameState"("userId");

-- CreateIndex
CREATE INDEX "GameReward_userId_createdAt_idx" ON "GameReward"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "GameReward_userId_idempotencyKey_key" ON "GameReward"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Exercise_equipment_idx" ON "Exercise"("equipment");

-- CreateIndex
CREATE INDEX "Exercise_focus_idx" ON "Exercise"("focus");

-- CreateIndex
CREATE INDEX "WorkoutPlan_userId_updatedAt_idx" ON "WorkoutPlan"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "WorkoutPlanExercise_exerciseId_idx" ON "WorkoutPlanExercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutPlanExercise_planId_sequence_key" ON "WorkoutPlanExercise"("planId", "sequence");

-- CreateIndex
CREATE INDEX "AssistantConversation_userId_updatedAt_idx" ON "AssistantConversation"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "AssistantMessage_conversationId_createdAt_idx" ON "AssistantMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantMessage_conversationId_clientRequestId_role_key" ON "AssistantMessage"("conversationId", "clientRequestId", "role");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_userId_createdAt_idx" ON "SecurityAuditEvent"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_action_createdAt_idx" ON "SecurityAuditEvent"("action", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "LegacyImport" ADD CONSTRAINT "LegacyImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitnessGoal" ADD CONSTRAINT "FitnessGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_customPlanId_fkey" FOREIGN KEY ("customPlanId") REFERENCES "WorkoutPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressMetric" ADD CONSTRAINT "ProgressMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameState" ADD CONSTRAINT "GameState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameReward" ADD CONSTRAINT "GameReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPlanExercise" ADD CONSTRAINT "WorkoutPlanExercise_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutPlanExercise" ADD CONSTRAINT "WorkoutPlanExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityAuditEvent" ADD CONSTRAINT "SecurityAuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
