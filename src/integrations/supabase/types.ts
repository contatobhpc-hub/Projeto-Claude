// Tipos do banco de dados do Marketing Hub 2.0.
// Depois de criar o projeto Supabase, você pode regenerar este arquivo com:
//   npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ModuleRow = { key: string; label: string; group_label: string; sort_order: number };

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  is_system: boolean;
  sort_order: number;
  created_at: string;
};

export type RolePermissionRow = {
  role_id: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  scope: "all" | "own";
};

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  job_title: string;
  avatar_url: string | null;
  role_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AuditLogRow = {
  id: number;
  table_name: string;
  record_id: string | null;
  action: "insert" | "update" | "delete" | "soft_delete" | "restore";
  changed_by: string | null;
  changed_at: string;
  old_data: Json | null;
  new_data: Json | null;
};

export type AttachmentRow = {
  id: string;
  module: string;
  record_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  created_by: string | null;
  created_at: string;
};

export type CommentRow = {
  id: string;
  module: string;
  record_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AppSettingRow = { key: string; value: Json; updated_by: string | null; updated_at: string };

export type MyPermissionRow = Omit<RolePermissionRow, "role_id">;

export type TrashRow = {
  table_name: string;
  module: string;
  record_id: string;
  title: string | null;
  deleted_at: string;
  deleted_by: string | null;
  purge_at: string;
};


// ---------------------------------------------------------------- Fase 2 — Operação
type Stamped = {
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ApprovalStatus = "Não solicitada" | "Aguardando" | "Aprovada" | "Reprovada";

type Approvable = {
  approval_status: ApprovalStatus;
  approval_note: string;
  approved_by: string | null;
  approved_at: string | null;
};

export type CampaignRow = Stamped &
  Approvable & {
    id: string;
    name: string;
    type: string;
    objective: string;
    status: string;
    priority: string;
    description: string;
    notes: string;
    start_date: string | null;
    end_date: string | null;
    owner_id: string | null;
    products: string[];
    budget: number;
  };

export type ProjectRow = Stamped &
  Approvable & {
    id: string;
    name: string;
    campaign_id: string | null;
    requester_area: string;
    internal_client: string;
    owner_id: string | null;
    team_ids: string[];
    due_date: string | null;
    status: string;
    priority: string;
    description: string;
  };

export type TaskRow = Stamped & {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  due_date: string | null;
  campaign_id: string | null;
  project_id: string | null;
  labels: string[];
  position: number;
  completed_at: string | null;
};

export type CalendarEventRow = Stamped & {
  id: string;
  title: string;
  category: string;
  status: string;
  priority: string;
  event_date: string;
  start_time: string | null;
  duration_min: number | null;
  description: string;
  assignee_id: string | null;
  participant_ids: string[];
  agency: string;
  campaign_id: string | null;
  project_id: string | null;
  task_id: string | null;
};

export type ContentItemRow = Stamped & {
  id: string;
  title: string;
  category: string;
  status: string;
  description: string;
  body: string;
  tags: string[];
  campaign_id: string | null;
  project_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  review_note: string;
};

export type ContentVersionRow = {
  id: string;
  content_id: string;
  version_no: number;
  title: string;
  body: string;
  created_by: string | null;
  created_at: string;
};

export type ContentFavoriteRow = { user_id: string; content_id: string; created_at: string };

export type ChecklistItemRow = {
  id: string;
  module: string;
  record_id: string;
  text: string;
  done: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
};

export type RecordHistoryRow = {
  id: number;
  action: AuditLogRow["action"];
  changed_by: string | null;
  changed_at: string;
  old_data: Json | null;
  new_data: Json | null;
};

export type Database = {
  public: {
    Tables: {
      modules: Table<ModuleRow>;
      roles: Table<RoleRow, Partial<RoleRow> & Pick<RoleRow, "key" | "name">>;
      role_permissions: Table<
        RolePermissionRow,
        Partial<RolePermissionRow> & Pick<RolePermissionRow, "role_id" | "module">
      >;
      profiles: Table<ProfileRow, Partial<ProfileRow> & Pick<ProfileRow, "id" | "email">>;
      audit_log: Table<AuditLogRow>;
      attachments: Table<
        AttachmentRow,
        Partial<AttachmentRow> & Pick<AttachmentRow, "module" | "record_id" | "file_name" | "storage_path">
      >;
      comments: Table<CommentRow, Partial<CommentRow> & Pick<CommentRow, "module" | "record_id" | "body">>;
      app_settings: Table<AppSettingRow, Partial<AppSettingRow> & Pick<AppSettingRow, "key" | "value">>;
      module_tables: Table<{ table_name: string; module: string; title_column: string }>;
      campaigns: Table<CampaignRow, Partial<CampaignRow> & Pick<CampaignRow, "name">>;
      projects: Table<ProjectRow, Partial<ProjectRow> & Pick<ProjectRow, "name">>;
      tasks: Table<TaskRow, Partial<TaskRow> & Pick<TaskRow, "title">>;
      calendar_events: Table<CalendarEventRow, Partial<CalendarEventRow> & Pick<CalendarEventRow, "title" | "event_date">>;
      content_items: Table<ContentItemRow, Partial<ContentItemRow> & Pick<ContentItemRow, "title">>;
      content_versions: Table<ContentVersionRow>;
      content_favorites: Table<ContentFavoriteRow, Partial<ContentFavoriteRow> & Pick<ContentFavoriteRow, "content_id">>;
      checklist_items: Table<ChecklistItemRow, Partial<ChecklistItemRow> & Pick<ChecklistItemRow, "module" | "record_id" | "text">>;
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_active_user: { Args: Record<string, never>; Returns: boolean };
      has_perm: { Args: { _module: string; _action: string }; Returns: boolean };
      my_permissions: { Args: Record<string, never>; Returns: MyPermissionRow[] };
      list_trash: { Args: Record<string, never>; Returns: TrashRow[] };
      restore_item: { Args: { _table: string; _id: string }; Returns: undefined };
      purge_item: { Args: { _table: string; _id: string }; Returns: undefined };
      purge_expired_trash: { Args: Record<string, never>; Returns: number };
      decide_approval: { Args: { _table: string; _id: string; _decision: string; _note?: string }; Returns: undefined };
      record_history: { Args: { _table: string; _id: string }; Returns: RecordHistoryRow[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
