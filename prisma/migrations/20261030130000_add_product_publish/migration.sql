-- Product: whether the Gumroad product is enabled once its file is uploaded.
-- When false the upload still runs and the product stays unpublished there.
ALTER TABLE "Product" ADD COLUMN "publish" BOOLEAN NOT NULL DEFAULT true;
