-- Add unique constraint to prevent duplicate TEAM rooms per project
-- This migration will:
-- 1. Clean up any existing duplicate TEAM rooms (keeping the oldest)
-- 2. Add the unique constraint

-- Step 1: Identify and clean up duplicates
-- Keep the oldest room for each (type, projectId) combination and delete the rest
WITH RankedRooms AS (
  SELECT 
    id,
    type,
    "projectId",
    ROW_NUMBER() OVER (PARTITION BY type, "projectId" ORDER BY "createdAt" ASC) as rn
  FROM "ChatRoom"
  WHERE type = 'TEAM' AND "projectId" IS NOT NULL
)
DELETE FROM "ChatRoom"
WHERE id IN (
  SELECT id FROM RankedRooms WHERE rn > 1
);

-- Step 2: Add unique constraint
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_type_projectId_key" UNIQUE (type, "projectId");
