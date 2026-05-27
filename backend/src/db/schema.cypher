// 1. Constraints (Ensure uniqueness and prevent duplicate webhook nodes)
CREATE CONSTRAINT deployment_id IF NOT EXISTS FOR (d:Deployment) REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT service_name IF NOT EXISTS FOR (s:Service) REQUIRE s.name IS UNIQUE;
CREATE CONSTRAINT commit_sha IF NOT EXISTS FOR (c:Commit) REQUIRE c.sha IS UNIQUE;

// 2. Indexes (For fast lookup and sorting on the Next.js dashboard)
CREATE INDEX deployment_status IF NOT EXISTS FOR (d:Deployment) ON (d.status);
CREATE INDEX deployment_completed_at IF NOT EXISTS FOR (d:Deployment) ON (d.completed_at);
CREATE INDEX service_env IF NOT EXISTS FOR (s:Service) ON (s.environment);
