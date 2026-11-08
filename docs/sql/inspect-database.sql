-- Handy queries to inspect the TechStore database.
-- Open this file in VS Code (SQL Server extension), connect to localhost, select a query and run it.

USE TechStoreDb;
GO

-- 1. All tables
SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- 2. Columns of every table: type, length (in characters), nullable, default
SELECT TABLE_NAME,
       COLUMN_NAME,
       DATA_TYPE,
       CHARACTER_MAXIMUM_LENGTH AS MAX_LENGTH,
       NUMERIC_PRECISION,
       NUMERIC_SCALE,
       IS_NULLABLE,
       COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- 3. Primary keys and foreign keys (which column points to which table)
SELECT tc.TABLE_NAME,
       tc.CONSTRAINT_TYPE,
       kcu.COLUMN_NAME,
       ccu.TABLE_NAME  AS REFERENCES_TABLE,
       ccu.COLUMN_NAME AS REFERENCES_COLUMN
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
  ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
  ON rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
LEFT JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
  ON ccu.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
WHERE tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'FOREIGN KEY')
ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_TYPE;

-- 4. Row count of every table
SELECT t.name AS TABLE_NAME, SUM(p.rows) AS ROW_COUNT
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
GROUP BY t.name
ORDER BY t.name;

-- 5. Everything about one table (columns, keys, indexes). Replace 'Products' with your table name.
-- EXEC sp_help 'Products';

-- 6. Peek at the data of one table
-- SELECT TOP 100 * FROM Products;
