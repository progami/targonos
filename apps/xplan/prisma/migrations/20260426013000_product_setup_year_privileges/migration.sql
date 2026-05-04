-- Keep workbook setup storage aligned with the hardened XPLAN schema roles.

ALTER TABLE "ProductSetupYear" OWNER TO portal_xplan;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE "ProductSetupYear"
TO portal_dev_external;
