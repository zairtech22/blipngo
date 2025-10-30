-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "brandColor" TEXT,
    "logoBgColor" TEXT,
    "ctaColor" TEXT,
    "ctaBgColor" TEXT,
    "publicTitle" TEXT,
    "publicSubtitle" TEXT,
    "publicFooter" TEXT,
    "ctaLabel" TEXT,
    "ctaText" TEXT,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "instagramUrl" TEXT,
    "tiktokUrl" TEXT,
    "youtubeUrl" TEXT,
    "googleReviewUrl" TEXT,
    "qrLayout" TEXT,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedirectHistory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "fromUrl" TEXT,
    "toUrl" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedirectHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "referer" TEXT,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReviewConfig" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "businessId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'google',
    "defaultTone" TEXT,
    "defaultLength" TEXT,
    "headline" TEXT,
    "disclaimer" TEXT,
    "welcome" TEXT,
    "qrTitle" TEXT,
    "qrDescription" TEXT,
    "qrTip" TEXT,
    "llmEnabled" BOOLEAN NOT NULL DEFAULT false,
    "llmProvider" TEXT,
    "llmModel" TEXT,
    "llmSystem" TEXT,
    "llmTemp" DOUBLE PRECISION,
    "flags" JSONB,

    CONSTRAINT "AiReviewConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AiReviewConfig_businessId_key" ON "AiReviewConfig"("businessId");

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedirectHistory" ADD CONSTRAINT "RedirectHistory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReviewConfig" ADD CONSTRAINT "AiReviewConfig_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
