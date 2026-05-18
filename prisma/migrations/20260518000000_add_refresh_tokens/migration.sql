-- CreateTable: RefreshToken
-- Stores bcrypt-hashed refresh tokens for secure token rotation.
-- Raw tokens are NEVER stored — only their bcrypt hashes.
-- revokedAt = NULL means the token is active.
-- Cascade delete: all tokens are removed when the user is deleted.

CREATE TABLE "RefreshToken" (
    "id"        TEXT        NOT NULL,
    "userId"    TEXT        NOT NULL,
    "tokenHash" TEXT        NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on tokenHash so each hashed token can only exist once
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- Index for fast lookup by userId (list all tokens for a user)
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- Index for cleanup jobs that expire old tokens
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- Foreign key: cascade delete when user is deleted
ALTER TABLE "RefreshToken"
    ADD CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
