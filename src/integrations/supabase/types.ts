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
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
