-- CreateTable
CREATE TABLE "DeploymentSnapshot" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "cpuCores" DOUBLE PRECISION NOT NULL,
    "memoryBytes" DOUBLE PRECISION NOT NULL,
    "restarts" INTEGER NOT NULL,
    "desiredReplicas" INTEGER NOT NULL,
    "availableReplicas" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeploymentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeploymentSnapshot_deploymentId_createdAt_idx" ON "DeploymentSnapshot"("deploymentId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeploymentSnapshot" ADD CONSTRAINT "DeploymentSnapshot_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
