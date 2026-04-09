-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT,
    "clientName" TEXT,
    "redirectUris" JSONB NOT NULL,
    "grantTypes" JSONB NOT NULL,
    "responseTypes" JSONB NOT NULL,
    "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'client_secret_basic',
    "scope" TEXT,
    "clientIdIssuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientSecretExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAuthorizationCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scope" TEXT,
    "codeChallenge" TEXT,
    "codeChallengeMethod" TEXT DEFAULT 'S256',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccessToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshToken" TEXT,
    "refreshExpiresAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalAccessToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'mcp:tools',
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON "OAuthClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAuthorizationCode_code_key" ON "OAuthAuthorizationCode"("code");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_code_idx" ON "OAuthAuthorizationCode"("code");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_clientId_idx" ON "OAuthAuthorizationCode"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccessToken_token_key" ON "OAuthAccessToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccessToken_refreshToken_key" ON "OAuthAccessToken"("refreshToken");

-- CreateIndex
CREATE INDEX "OAuthAccessToken_token_idx" ON "OAuthAccessToken"("token");

-- CreateIndex
CREATE INDEX "OAuthAccessToken_refreshToken_idx" ON "OAuthAccessToken"("refreshToken");

-- CreateIndex
CREATE INDEX "OAuthAccessToken_userId_idx" ON "OAuthAccessToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalAccessToken_tokenHash_key" ON "PersonalAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PersonalAccessToken_tokenHash_idx" ON "PersonalAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PersonalAccessToken_userId_idx" ON "PersonalAccessToken"("userId");

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalAccessToken" ADD CONSTRAINT "PersonalAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
