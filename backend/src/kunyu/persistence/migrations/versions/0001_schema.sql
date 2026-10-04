-- Frozen development baseline. Subsequent revisions own their schema changes.

CREATE TABLE messages (
	id VARCHAR(64) NOT NULL, 
	session_id VARCHAR(64) NOT NULL, 
	sequence INTEGER NOT NULL, 
	role VARCHAR(32) NOT NULL, 
	content TEXT NOT NULL, 
	run_id VARCHAR(64), 
	step INTEGER, 
	attempt INTEGER, 
	status VARCHAR(32) NOT NULL, 
	content_length INTEGER NOT NULL, 
	updated_sequence INTEGER NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_messages_sequence_positive CHECK (sequence > 0), 
	CONSTRAINT ck_messages_role CHECK (role IN ('user', 'assistant')), 
	CONSTRAINT ck_messages_status CHECK (status IN ('streaming', 'completed', 'interrupted', 'failed', 'cancelled')), 
	CONSTRAINT ck_messages_content_length_nonnegative CHECK (content_length >= 0), 
	CONSTRAINT ck_messages_updated_sequence_positive CHECK (updated_sequence > 0), 
	CONSTRAINT ck_messages_role_shape CHECK ((role = 'user' AND step IS NULL AND attempt IS NULL AND status IN ('completed', 'cancelled')) OR (role = 'assistant' AND run_id IS NOT NULL AND step > 0 AND attempt > 0)), 
	FOREIGN KEY(run_id, session_id) REFERENCES runs (id, session_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED, 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ix_messages_session_sequence ON messages (session_id, sequence);

CREATE UNIQUE INDEX uq_messages_assistant_attempt ON messages (run_id, step, attempt) WHERE role = 'assistant';

CREATE UNIQUE INDEX uq_messages_id_session ON messages (id, session_id);

CREATE TABLE model_connections (
	id VARCHAR(64) NOT NULL, 
	display_name VARCHAR(200) NOT NULL, 
	provider_type VARCHAR(32) NOT NULL, 
	protocol VARCHAR(32) NOT NULL, 
	base_url VARCHAR(2048) NOT NULL, 
	auth_mode VARCHAR(32) NOT NULL, 
	enabled BOOLEAN NOT NULL, 
	is_default BOOLEAN NOT NULL, 
	revision INTEGER NOT NULL, 
	default_model_id VARCHAR(256), 
	enabled_model_ids JSON NOT NULL, 
	max_tokens_field VARCHAR(32) NOT NULL, 
	include_usage BOOLEAN NOT NULL, 
	credential_status VARCHAR(32) NOT NULL, 
	retry_policy JSON NOT NULL, 
	credential_configured BOOLEAN NOT NULL, 
	credential_updated_at DATETIME, 
	management_status VARCHAR(32) NOT NULL, 
	discovery_status VARCHAR(32) NOT NULL, 
	discovery_generation INTEGER NOT NULL, 
	discovery_last_success_at DATETIME, 
	discovery_error_code VARCHAR(100), 
	check_generation INTEGER NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_model_connections_protocol CHECK (protocol IN ('openai_compatible', 'deepseek_messages')), 
	CONSTRAINT ck_model_connections_provider_type CHECK (provider_type IN ('openai', 'deepseek', 'moonshot', 'zai', 'siliconflow', 'openrouter', 'groq', 'nvidia', 'together', 'deepinfra', 'fireworks', 'alibaba', 'xai', 'mistral', 'ollama', 'lm_studio', 'localai', 'custom')), 
	CONSTRAINT ck_model_connections_auth_mode CHECK (auth_mode IN ('api_key', 'none')), 
	CONSTRAINT ck_model_connections_max_tokens_field CHECK (max_tokens_field IN ('max_tokens', 'max_completion_tokens')), 
	CONSTRAINT ck_model_connections_revision_positive CHECK (revision > 0), 
	CONSTRAINT ck_model_connections_discovery_generation_nonnegative CHECK (discovery_generation >= 0), 
	CONSTRAINT ck_model_connections_check_generation_nonnegative CHECK (check_generation >= 0), 
	CONSTRAINT ck_model_connections_credential_status CHECK (credential_status IN ('ready', 'missing')), 
	CONSTRAINT ck_model_connections_management_status CHECK (management_status = 'ready'), 
	CONSTRAINT ck_model_connections_discovery_status CHECK (discovery_status IN ('idle', 'pending', 'succeeded', 'failed', 'interrupted'))
);

CREATE INDEX ix_model_connections_updated_at ON model_connections (updated_at);

CREATE UNIQUE INDEX uq_model_connections_single_default ON model_connections (is_default) WHERE is_default = 1;

CREATE TABLE runs (
	id VARCHAR(64) NOT NULL, 
	session_id VARCHAR(64) NOT NULL, 
	user_message_id VARCHAR(64) NOT NULL, 
	state VARCHAR(32) NOT NULL, 
	step INTEGER NOT NULL, 
	attempt INTEGER NOT NULL, 
	resume_phase VARCHAR(16) NOT NULL, 
	next_tool_index INTEGER NOT NULL, 
	requires_resume BOOLEAN NOT NULL, 
	queue_sequence INTEGER, 
	pending_confirmation_id VARCHAR(64), 
	pause_reason VARCHAR(200), 
	max_model_calls INTEGER NOT NULL, 
	model_calls INTEGER NOT NULL, 
	max_tool_calls INTEGER NOT NULL, 
	tool_calls INTEGER NOT NULL, 
	max_active_milliseconds INTEGER NOT NULL, 
	active_milliseconds INTEGER NOT NULL, 
	max_output_codepoints INTEGER NOT NULL, 
	output_codepoints INTEGER NOT NULL, 
	input_tokens INTEGER, 
	output_tokens INTEGER, 
	total_tokens INTEGER, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	updated_sequence INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_runs_state CHECK (state IN ('ready', 'model_running', 'tool_running', 'waiting_confirmation', 'interrupted', 'completed', 'failed', 'cancelled')), 
	CONSTRAINT ck_runs_step_nonnegative CHECK (step >= 0), 
	CONSTRAINT ck_runs_attempt_nonnegative CHECK (attempt >= 0), 
	CONSTRAINT ck_runs_resume_phase CHECK (resume_phase IN ('model', 'tool')), 
	CONSTRAINT ck_runs_next_tool_index_nonnegative CHECK (next_tool_index >= 0), 
	CONSTRAINT ck_runs_queue_sequence_positive CHECK (queue_sequence IS NULL OR queue_sequence > 0), 
	CONSTRAINT ck_runs_updated_sequence_positive CHECK (updated_sequence > 0), 
	CONSTRAINT ck_runs_budget_nonnegative CHECK (max_model_calls > 0 AND model_calls >= 0 AND max_tool_calls > 0 AND tool_calls >= 0 AND max_active_milliseconds > 0 AND active_milliseconds >= 0 AND max_output_codepoints > 0 AND output_codepoints >= 0), 
	FOREIGN KEY(user_message_id, session_id) REFERENCES messages (id, session_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED, 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX ix_runs_session_created ON runs (session_id, created_at);

CREATE UNIQUE INDEX uq_runs_id_session ON runs (id, session_id);

CREATE UNIQUE INDEX uq_runs_session_active ON runs (session_id) WHERE state IN ('ready', 'model_running', 'tool_running', 'waiting_confirmation', 'interrupted');

CREATE TABLE workspaces (
	id VARCHAR(64) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id)
);

CREATE INDEX ix_workspaces_updated_at ON workspaces (updated_at);

CREATE TABLE model_catalog_entries (
	connection_id VARCHAR(64) NOT NULL, 
	model_id VARCHAR(256) NOT NULL, 
	display_name VARCHAR(256), 
	sources JSON NOT NULL, 
	revision INTEGER NOT NULL, 
	availability VARCHAR(32) NOT NULL, 
	text_check VARCHAR(32) NOT NULL, 
	text_checked_at DATETIME, 
	text_error_code VARCHAR(100), 
	tool_check VARCHAR(32) NOT NULL, 
	tool_checked_at DATETIME, 
	tool_error_code VARCHAR(100), 
	tool_capability VARCHAR(32) NOT NULL, 
	tool_capability_source VARCHAR(32) NOT NULL, 
	reasoning_efforts JSON NOT NULL, 
	reasoning_default VARCHAR(64), 
	reasoning_source VARCHAR(32) NOT NULL, 
	discovered_at DATETIME, 
	PRIMARY KEY (connection_id, model_id), 
	CONSTRAINT ck_model_catalog_revision_positive CHECK (revision > 0), 
	CONSTRAINT ck_model_catalog_availability CHECK (availability IN ('available', 'unavailable')), 
	CONSTRAINT ck_model_catalog_text_check CHECK (text_check IN ('unchecked', 'passed', 'failed')), 
	CONSTRAINT ck_model_catalog_tool_check CHECK (tool_check IN ('unchecked', 'passed', 'failed')), 
	CONSTRAINT ck_model_catalog_tool_capability CHECK (tool_capability IN ('unknown', 'supported', 'unsupported')), 
	CONSTRAINT ck_model_catalog_tool_capability_source CHECK (tool_capability_source IN ('unknown', 'provider_metadata', 'validation')), 
	CONSTRAINT ck_model_catalog_reasoning_source CHECK (reasoning_source IN ('unknown', 'provider_metadata', 'protocol')), 
	FOREIGN KEY(connection_id) REFERENCES model_connections (id) ON DELETE CASCADE
);

CREATE INDEX ix_model_catalog_connection_revision ON model_catalog_entries (connection_id, revision);

CREATE TABLE model_credentials (
	connection_id VARCHAR(64) NOT NULL, 
	api_key TEXT NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (connection_id), 
	FOREIGN KEY(connection_id) REFERENCES model_connections (id) ON DELETE CASCADE
);

CREATE TABLE run_model_snapshots (
	run_id VARCHAR(64) NOT NULL, 
	session_id VARCHAR(64) NOT NULL, 
	connection_id VARCHAR(64) NOT NULL, 
	provider_type VARCHAR(32) NOT NULL, 
	protocol VARCHAR(32) NOT NULL, 
	base_url VARCHAR(2048) NOT NULL, 
	auth_mode VARCHAR(32) NOT NULL, 
	model_id VARCHAR(256) NOT NULL, 
	reasoning_effort VARCHAR(64), 
	connection_revision INTEGER NOT NULL, 
	max_tokens_field VARCHAR(32) NOT NULL, 
	include_usage BOOLEAN NOT NULL, 
	max_output_tokens INTEGER NOT NULL, 
	map_context JSON NOT NULL, 
	scene JSON, 
	PRIMARY KEY (run_id), 
	CONSTRAINT ck_run_snapshots_protocol CHECK (protocol IN ('openai_compatible', 'deepseek_messages')), 
	CONSTRAINT ck_run_snapshots_auth_mode CHECK (auth_mode IN ('api_key', 'none')), 
	CONSTRAINT ck_run_snapshots_max_tokens_field CHECK (max_tokens_field IN ('max_tokens', 'max_completion_tokens')), 
	CONSTRAINT ck_run_snapshots_revision_positive CHECK (connection_revision > 0), 
	CONSTRAINT ck_run_snapshots_output_tokens_positive CHECK (max_output_tokens > 0), 
	FOREIGN KEY(run_id, session_id) REFERENCES runs (id, session_id) ON DELETE CASCADE
);

CREATE TABLE sessions (
	id VARCHAR(64) NOT NULL, 
	workspace_id VARCHAR(64) NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);

CREATE INDEX ix_sessions_workspace_updated_at ON sessions (workspace_id, updated_at);

CREATE TABLE tool_calls (
	id VARCHAR(64) NOT NULL, 
	session_id VARCHAR(64) NOT NULL, 
	run_id VARCHAR(64) NOT NULL, 
	message_id VARCHAR(64) NOT NULL, 
	step INTEGER NOT NULL, 
	attempt INTEGER NOT NULL, 
	provider_call_id VARCHAR(256) NOT NULL, 
	batch_index INTEGER NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	arguments JSON NOT NULL, 
	status VARCHAR(32) NOT NULL, 
	result JSON, 
	error_code VARCHAR(100), 
	error_summary VARCHAR(500), 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	updated_sequence INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_tool_calls_step_positive CHECK (step > 0), 
	CONSTRAINT ck_tool_calls_attempt_positive CHECK (attempt > 0), 
	CONSTRAINT ck_tool_calls_batch_index_nonnegative CHECK (batch_index >= 0), 
	CONSTRAINT ck_tool_calls_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')), 
	CONSTRAINT ck_tool_calls_updated_sequence_positive CHECK (updated_sequence > 0), 
	FOREIGN KEY(run_id, session_id) REFERENCES runs (id, session_id) ON DELETE CASCADE, 
	FOREIGN KEY(message_id, session_id) REFERENCES messages (id, session_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_tool_calls_batch_index ON tool_calls (run_id, step, attempt, batch_index);

CREATE UNIQUE INDEX uq_tool_calls_provider_attempt ON tool_calls (run_id, step, attempt, provider_call_id);

CREATE TABLE workspace_memories (
	id VARCHAR(64) NOT NULL, 
	workspace_id VARCHAR(64) NOT NULL, 
	content TEXT NOT NULL, 
	source_tool_call_id VARCHAR(64) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_workspace_memories_content_length CHECK (length(content) BETWEEN 1 AND 2000), 
	CONSTRAINT uq_workspace_memories_source_tool_call_id UNIQUE (source_tool_call_id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id)
);

CREATE INDEX ix_workspace_memories_workspace_created ON workspace_memories (workspace_id, created_at, id);

CREATE TABLE workspace_removals (
	workspace_id VARCHAR(64) NOT NULL, 
	PRIMARY KEY (workspace_id), 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
);

CREATE TABLE confirmations (
	id VARCHAR(64) NOT NULL, 
	session_id VARCHAR(64) NOT NULL, 
	run_id VARCHAR(64) NOT NULL, 
	tool_call_id VARCHAR(64) NOT NULL, 
	workspace_id VARCHAR(64) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	arguments JSON NOT NULL, 
	summary VARCHAR(500) NOT NULL, 
	side_effect VARCHAR(500) NOT NULL, 
	status VARCHAR(32) NOT NULL, 
	decided_at DATETIME, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	updated_sequence INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_confirmations_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')), 
	CONSTRAINT ck_confirmations_updated_sequence_positive CHECK (updated_sequence > 0), 
	CONSTRAINT ck_confirmations_decision_shape CHECK ((status = 'pending' AND decided_at IS NULL) OR (status != 'pending' AND decided_at IS NOT NULL)), 
	FOREIGN KEY(run_id, session_id) REFERENCES runs (id, session_id) ON DELETE CASCADE, 
	CONSTRAINT uq_confirmations_tool_call_id UNIQUE (tool_call_id), 
	FOREIGN KEY(tool_call_id) REFERENCES tool_calls (id) ON DELETE CASCADE, 
	FOREIGN KEY(workspace_id) REFERENCES workspaces (id)
);

CREATE INDEX ix_confirmations_session_created ON confirmations (session_id, created_at);

CREATE TABLE message_idempotency (
	id INTEGER NOT NULL, 
	session_id VARCHAR(64) NOT NULL, 
	idempotency_key VARCHAR(36) NOT NULL, 
	normalized_body TEXT NOT NULL, 
	message_id VARCHAR(64) NOT NULL, 
	run_id VARCHAR(64) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_message_idempotency_session_key UNIQUE (session_id, idempotency_key), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX ix_message_idempotency_run_id ON message_idempotency (run_id);

CREATE TABLE session_archives (
	session_id VARCHAR(64) NOT NULL, 
	PRIMARY KEY (session_id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE TABLE session_events (
	id VARCHAR(64) NOT NULL, 
	session_id VARCHAR(64) NOT NULL, 
	sequence INTEGER NOT NULL, 
	event_type VARCHAR(100) NOT NULL, 
	payload JSON NOT NULL, 
	run_id VARCHAR(64), 
	occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_session_events_sequence_positive CHECK (sequence > 0), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX ix_session_events_run_id ON session_events (run_id);

CREATE UNIQUE INDEX ix_session_events_session_sequence ON session_events (session_id, sequence);

CREATE TABLE session_preferences (
	session_id VARCHAR(64) NOT NULL, 
	connection_id VARCHAR(64) NOT NULL, 
	model_id VARCHAR(256) NOT NULL, 
	reasoning_effort VARCHAR(64), 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (session_id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);
